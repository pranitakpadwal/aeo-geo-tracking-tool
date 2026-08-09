import { randomUUID } from "crypto";
import db from "./db";
import { createBulkScan, listBulkScansForUniverse, runBulkScan } from "./bulk-scan";
import type {
  BulkScanInput,
  CompetitorInput,
  PromptMode,
  Universe,
  UniverseDetail,
  UniverseInput,
  UniverseTopicRecord,
} from "./types";

/**
 * Persistent brand+category tracker. Created once with a fixed brand,
 * domain, competitor list and topic list; runs (bulk_scans rows) are then
 * kicked off against it repeatedly without ever re-uploading a CSV, so
 * mentions/citations/themes can be watched moving up/down over time.
 */
export function createUniverse(input: UniverseInput): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO universes (id, name, brand, domain, competitors)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.name, input.brand, input.domain || null, JSON.stringify(input.competitors));

  const insertTopic = db.prepare(
    `INSERT INTO universe_topics (universe_id, topic, type, category, priority_tier, volume)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((topics: UniverseInput["topics"]) => {
    topics.forEach((t) => {
      insertTopic.run(id, t.topic, t.type || null, t.category || null, t.priorityTier || null, t.volume ?? null);
    });
  });
  insertMany(input.topics);

  return id;
}

interface UniverseRow {
  id: string;
  name: string;
  brand: string;
  domain: string | null;
  competitors: string;
  created_at: string;
}

interface UniverseTopicRow {
  id: number;
  universe_id: string;
  topic: string;
  type: string | null;
  category: string | null;
  priority_tier: string | null;
  volume: number | null;
}

function rowToUniverse(row: UniverseRow): Universe {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    domain: row.domain,
    competitors: JSON.parse(row.competitors || "[]") as CompetitorInput[],
    createdAt: row.created_at,
  };
}

function rowToTopic(row: UniverseTopicRow): UniverseTopicRecord {
  return {
    id: row.id,
    universeId: row.universe_id,
    topic: row.topic,
    type: row.type || undefined,
    category: row.category || undefined,
    priorityTier: row.priority_tier || undefined,
    volume: row.volume ?? undefined,
  };
}

/** Universe detail (record + fixed topic list + run history + latest run id). */
export function getUniverse(id: string): UniverseDetail | null {
  const row = db.prepare(`SELECT * FROM universes WHERE id = ?`).get(id) as UniverseRow | undefined;
  if (!row) return null;

  const topicRows = db
    .prepare(`SELECT * FROM universe_topics WHERE universe_id = ? ORDER BY id ASC`)
    .all(id) as UniverseTopicRow[];
  const topics = topicRows.map(rowToTopic);

  const runs = listBulkScansForUniverse(id).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    promptMode: r.promptMode,
  }));
  const latestRunId = runs.length > 0 ? runs[runs.length - 1].id : null;

  return { ...rowToUniverse(row), topics, topicCount: topics.length, runs, latestRunId };
}

export function listUniverses(): Universe[] {
  const rows = db.prepare(`SELECT * FROM universes ORDER BY created_at DESC`).all() as UniverseRow[];
  return rows.map(rowToUniverse);
}

/** All runs for a universe, oldest first — the series a run-history/trend
 * view and the report's movement diff both read from. */
export function listRunsForUniverse(universeId: string) {
  return listBulkScansForUniverse(universeId);
}

/**
 * Builds a BulkScanInput straight from what's stored on the universe (no
 * re-upload needed), stamps universe_id on the new bulk_scans row, and fires
 * the run — same fire-and-forget pattern used by POST /api/bulk-scan.
 */
export function startUniverseRun(universeId: string, promptMode?: PromptMode): string {
  const universe = getUniverse(universeId);
  if (!universe) {
    throw new Error(`Universe ${universeId} not found.`);
  }

  const input: BulkScanInput = {
    brand: universe.brand,
    domain: universe.domain || undefined,
    competitors: universe.competitors,
    topics: universe.topics.map((t) => ({
      topic: t.topic,
      type: t.type,
      category: t.category,
      priorityTier: t.priorityTier,
      volume: t.volume,
    })),
    promptMode,
  };

  const runId = createBulkScan(input, universeId);

  runBulkScan(runId, input).catch((err) => {
    console.error(`Universe run ${runId} (universe ${universeId}) failed:`, err);
  });

  return runId;
}
