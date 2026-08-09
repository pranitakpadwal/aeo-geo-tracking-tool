import { randomUUID } from "crypto";
import db from "./db";
import { answerPromptGrounded, generateTopicQuestions, groupTopicsIntoThemes } from "./anthropic";
import { attributeCitations, findCompetitorMentions, findMention } from "./analyze";
import type {
  BulkScanDetail,
  BulkScanInput,
  BulkScanRecord,
  BulkScanTopicResult,
  CitationRef,
  CompetitorInput,
} from "./types";

const QUESTION_BATCH_SIZE = 15;

export function createBulkScan(input: BulkScanInput, universeId?: string | null): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO bulk_scans (id, brand, domain, competitors, status, total_topics, universe_id)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    input.brand,
    input.domain || null,
    JSON.stringify(input.competitors),
    input.topics.length,
    universeId || null
  );

  const insertTopic = db.prepare(
    `INSERT INTO bulk_scan_topics (bulk_scan_id, idx, topic, type, category, priority_tier, volume, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  );
  const insertMany = db.transaction((topics: BulkScanInput["topics"]) => {
    topics.forEach((t, i) => {
      insertTopic.run(id, i, t.topic, t.type || null, t.category || null, t.priorityTier || null, t.volume ?? null);
    });
  });
  insertMany(input.topics);

  return id;
}

interface TopicRow {
  id: number;
  topic: string;
  question: string | null;
}

interface CategoryRow {
  id: number;
  topic: string;
  category: string | null;
}

/**
 * If nobody supplied a `category` on any topic in this scan (the "just
 * uploaded a flat list of queries" case), auto-group the whole list into a
 * small number of themes via Claude and persist them as each topic's
 * category — same column the theme breakdown/report already reads, so no
 * downstream code needs to know whether a category was hand-supplied or
 * auto-generated. Left alone (no-op) if even one topic already has a
 * category — that's treated as the user's own grouping and respected as-is.
 */
async function autoGroupIfUncategorized(bulkScanId: string): Promise<void> {
  const rows = db
    .prepare(`SELECT id, topic, category FROM bulk_scan_topics WHERE bulk_scan_id = ? ORDER BY idx ASC`)
    .all(bulkScanId) as CategoryRow[];

  if (rows.length === 0 || rows.some((r) => r.category)) return;

  const themes = await groupTopicsIntoThemes(rows.map((r) => r.topic));
  const updateCategory = db.prepare(`UPDATE bulk_scan_topics SET category = ? WHERE id = ?`);
  const updateMany = db.transaction(() => {
    rows.forEach((r, i) => updateCategory.run(themes[i] || "Uncategorized", r.id));
  });
  updateMany();
}

/**
 * Runs the whole bulk scan: batch-generates a shopper question per topic,
 * then for each topic makes a grounded (real web search) call, detects
 * brand/competitor mentions in the text and attributes the real citation
 * URLs to brand/competitor/other. Progress is persisted per-topic as it
 * goes, so a client polling GET /api/bulk-scan/[id] sees it fill in live.
 *
 * Runs sequentially — deliberately not parallelized. This is meant to run
 * on a persistent Node process (e.g. `next start` on Railway), fired off
 * without being awaited by the API route; sequential calls keep it well
 * under any provider's concurrent-request limits for a background job.
 */
export async function runBulkScan(bulkScanId: string, input: BulkScanInput): Promise<void> {
  db.prepare(`UPDATE bulk_scans SET status = 'running' WHERE id = ?`).run(bulkScanId);

  try {
    await autoGroupIfUncategorized(bulkScanId);

    const rows = db
      .prepare(`SELECT id, topic, question FROM bulk_scan_topics WHERE bulk_scan_id = ? ORDER BY idx ASC`)
      .all(bulkScanId) as TopicRow[];

    const updateQuestion = db.prepare(`UPDATE bulk_scan_topics SET question = ? WHERE id = ?`);
    for (let i = 0; i < rows.length; i += QUESTION_BATCH_SIZE) {
      const batch = rows.slice(i, i + QUESTION_BATCH_SIZE);
      const questions = await generateTopicQuestions(batch.map((r) => r.topic));
      batch.forEach((r, j) => {
        const q = questions[j] || r.topic;
        r.question = q;
        updateQuestion.run(q, r.id);
      });
    }

    const updateResult = db.prepare(`
      UPDATE bulk_scan_topics
      SET response_text = ?, brand_mentioned = ?, brand_position = ?, competitors_mentioned = ?,
          brand_citations = ?, competitor_citations = ?, other_citations = ?, status = 'done'
      WHERE id = ?
    `);
    const updateError = db.prepare(`UPDATE bulk_scan_topics SET status = 'error', error = ? WHERE id = ?`);
    const bumpProgress = db.prepare(`UPDATE bulk_scans SET completed_topics = completed_topics + 1 WHERE id = ?`);

    for (const row of rows) {
      try {
        const question = row.question || row.topic;
        const answer = await answerPromptGrounded(question);

        const brandMention = findMention(answer.text, input.brand, input.domain);
        const competitorsMentioned = findCompetitorMentions(
          answer.text,
          input.competitors.map((c) => c.name)
        );
        const attributed = attributeCitations(answer.citations, input.domain, input.competitors);

        updateResult.run(
          answer.text,
          brandMention.mentioned ? 1 : 0,
          brandMention.position,
          JSON.stringify(competitorsMentioned),
          JSON.stringify(attributed.brandUrls),
          JSON.stringify(attributed.competitorUrls),
          JSON.stringify(attributed.other),
          row.id
        );
      } catch (err) {
        updateError.run(err instanceof Error ? err.message : "Unknown error", row.id);
      }
      bumpProgress.run(bulkScanId);
    }

    db.prepare(`UPDATE bulk_scans SET status = 'complete', completed_at = datetime('now') WHERE id = ?`).run(
      bulkScanId
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare(`UPDATE bulk_scans SET status = 'error', error = ? WHERE id = ?`).run(message, bulkScanId);
    throw err;
  }
}

interface BulkScanRow {
  id: string;
  brand: string;
  domain: string | null;
  competitors: string;
  status: BulkScanRecord["status"];
  error: string | null;
  total_topics: number;
  completed_topics: number;
  created_at: string;
  completed_at: string | null;
  universe_id: string | null;
}

interface BulkScanTopicRow {
  id: number;
  idx: number;
  topic: string;
  type: string | null;
  category: string | null;
  priority_tier: string | null;
  volume: number | null;
  question: string | null;
  response_text: string | null;
  brand_mentioned: number | null;
  brand_position: number | null;
  competitors_mentioned: string;
  brand_citations: string;
  competitor_citations: string;
  other_citations: string;
  status: BulkScanTopicResult["status"];
  error: string | null;
}

function rowToRecord(row: BulkScanRow): BulkScanRecord {
  return {
    id: row.id,
    brand: row.brand,
    domain: row.domain,
    competitors: JSON.parse(row.competitors || "[]") as CompetitorInput[],
    status: row.status,
    error: row.error,
    totalTopics: row.total_topics,
    completedTopics: row.completed_topics,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    universeId: row.universe_id,
  };
}

function rowToTopicResult(row: BulkScanTopicRow): BulkScanTopicResult {
  return {
    id: row.id,
    idx: row.idx,
    topic: row.topic,
    type: row.type,
    category: row.category,
    priorityTier: row.priority_tier,
    volume: row.volume,
    question: row.question,
    responseText: row.response_text,
    brandMentioned: Boolean(row.brand_mentioned),
    brandPosition: row.brand_position,
    competitorsMentioned: JSON.parse(row.competitors_mentioned || "{}"),
    brandCitations: JSON.parse(row.brand_citations || "[]") as CitationRef[],
    competitorCitations: JSON.parse(row.competitor_citations || "{}") as Record<string, CitationRef[]>,
    otherCitations: JSON.parse(row.other_citations || "[]") as CitationRef[],
    status: row.status,
    error: row.error,
  };
}

export function getBulkScan(id: string): BulkScanDetail | null {
  const row = db.prepare(`SELECT * FROM bulk_scans WHERE id = ?`).get(id) as BulkScanRow | undefined;
  if (!row) return null;

  const topicRows = db
    .prepare(`SELECT * FROM bulk_scan_topics WHERE bulk_scan_id = ? ORDER BY idx ASC`)
    .all(id) as BulkScanTopicRow[];

  return { ...rowToRecord(row), topics: topicRows.map(rowToTopicResult) };
}

export function listBulkScans(limit = 50): BulkScanRecord[] {
  const rows = db
    .prepare(`SELECT * FROM bulk_scans ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as BulkScanRow[];
  return rows.map(rowToRecord);
}

/** All runs (any status) belonging to a universe, oldest first — the run
 * history / trend series shown on a universe's dashboard. */
export function listBulkScansForUniverse(universeId: string): BulkScanRecord[] {
  const rows = db
    .prepare(`SELECT * FROM bulk_scans WHERE universe_id = ? ORDER BY created_at ASC`)
    .all(universeId) as BulkScanRow[];
  return rows.map(rowToRecord);
}

/** All completed bulk scans for the same brand+domain, oldest first — the
 * series a trend/movement report diffs across. */
export function listBulkScansForBrand(brand: string, domain?: string | null): BulkScanRecord[] {
  const rows = (
    domain
      ? db
          .prepare(
            `SELECT * FROM bulk_scans WHERE brand = ? AND domain = ? AND status = 'complete' ORDER BY created_at ASC`
          )
          .all(brand, domain)
      : db
          .prepare(`SELECT * FROM bulk_scans WHERE brand = ? AND status = 'complete' ORDER BY created_at ASC`)
          .all(brand)
  ) as BulkScanRow[];
  return rows.map(rowToRecord);
}
