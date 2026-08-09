import { randomUUID } from "crypto";
import db from "./db";
import { classifyKeywordsAgainstThemes, proposeThemes } from "./anthropic";
import { createBulkScan, listBulkScansForUniverse, runBulkScan } from "./bulk-scan";
import type {
  BulkScanInput,
  CompetitorInput,
  PromptMode,
  ThemeSummaryRow,
  Universe,
  UniverseDetail,
  UniverseInput,
  UniverseTopicRecord,
} from "./types";

// How many of a tracked theme's keywords actually get scanned per run,
// picked by highest volume. This is the cost control: a run costs
// (tracked themes × TOP_N_PER_THEME) grounded Claude calls, regardless of
// whether the universe holds 100 or 10,000 total keywords.
const TOP_N_PER_THEME = 20;

// Categorization (the cheap pre-run pass) samples this many of the
// highest-volume keywords to propose a theme list, then classifies every
// keyword against that fixed list in batches of this size. Both bounds
// keep classification cost flat regardless of total upload size.
const CATEGORIZE_SAMPLE_SIZE = 300;
const CATEGORIZE_BATCH_SIZE = 100;

/**
 * Persistent brand+category tracker. Created once with a fixed brand,
 * domain, competitor list and a raw keyword/topic list (up to thousands of
 * rows); runs (bulk_scans rows) are then kicked off against it repeatedly
 * without ever re-uploading a CSV, so mentions/citations/themes can be
 * watched moving up/down over time.
 *
 * If every uploaded row already has a `category` (e.g. a hand-curated
 * list), categorization is marked complete immediately — no Claude calls
 * spent re-labeling what the user already labeled. Otherwise it's left
 * `pending` for the caller to kick off runCategorization() in the
 * background (POST /api/universe does this, fire-and-forget, same pattern
 * as a bulk scan run).
 */
export function createUniverse(input: UniverseInput, userId?: string | null): string {
  const id = randomUUID();
  const needsCategorization = input.topics.some((t) => !t.category?.trim());

  db.prepare(
    `INSERT INTO universes (id, name, brand, domain, competitors, user_id, categorization_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.brand,
    input.domain || null,
    JSON.stringify(input.competitors),
    userId || null,
    needsCategorization ? "pending" : "complete"
  );

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
  user_id: string | null;
  categorization_status: string | null;
  categorization_error: string | null;
  tracked_themes: string;
  auto_run_enabled: number;
  last_auto_run_at: string | null;
}

interface UniverseTopicRow {
  id: number;
  universe_id: string;
  topic: string;
  type: string | null;
  category: string | null;
  priority_tier: string | null;
  volume: number | null;
  tracked: number;
}

function rowToUniverse(row: UniverseRow): Universe {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    domain: row.domain,
    competitors: JSON.parse(row.competitors || "[]") as CompetitorInput[],
    createdAt: row.created_at,
    categorizationStatus: (row.categorization_status as Universe["categorizationStatus"]) ?? null,
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
    tracked: Boolean(row.tracked),
  };
}

/**
 * Universe detail: record + the *tracked* topic list (the bounded set that
 * actually gets scanned — safe to ship to the client even for a
 * 10,000-keyword universe), the full theme summary (aggregated, cheap),
 * run history, and the latest run id.
 */
export function getUniverse(id: string): UniverseDetail | null {
  const row = db.prepare(`SELECT * FROM universes WHERE id = ?`).get(id) as UniverseRow | undefined;
  if (!row) return null;

  const topicRows = db
    .prepare(`SELECT * FROM universe_topics WHERE universe_id = ? AND tracked = 1 ORDER BY volume DESC, id ASC`)
    .all(id) as UniverseTopicRow[];
  const topics = topicRows.map(rowToTopic);

  const totalCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM universe_topics WHERE universe_id = ?`).get(id) as { n: number }
  ).n;

  const runs = listBulkScansForUniverse(id).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    promptMode: r.promptMode,
  }));
  const latestRunId = runs.length > 0 ? runs[runs.length - 1].id : null;

  return {
    ...rowToUniverse(row),
    topics,
    topicCount: totalCount,
    trackedTopicCount: topics.length,
    themeSummary: getThemeSummary(id),
    trackedThemes: JSON.parse(row.tracked_themes || "[]") as string[],
    autoRunEnabled: Boolean(row.auto_run_enabled),
    lastAutoRunAt: row.last_auto_run_at,
    categorizationError: row.categorization_error,
    runs,
    latestRunId,
  };
}

/** A user's own universes, newest first — the "My Universes" list. */
export function listUniverses(userId: string): Universe[] {
  const rows = db
    .prepare(`SELECT * FROM universes WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as UniverseRow[];
  return rows.map(rowToUniverse);
}

/**
 * Existence + ownership of a universe, without paying for a full
 * getUniverse() (topics + run history) fetch. `userId: null` distinguishes
 * "exists but predates accounts" (grandfathered, anyone can view) from
 * "doesn't exist" (`exists: false`) — the page guard treats those
 * differently.
 */
export function getUniverseOwner(id: string): { exists: boolean; userId: string | null } {
  const row = db.prepare(`SELECT user_id FROM universes WHERE id = ?`).get(id) as { user_id: string | null } | undefined;
  return row ? { exists: true, userId: row.user_id } : { exists: false, userId: null };
}

/** All runs for a universe, oldest first — the series a run-history/trend
 * view and the report's movement diff both read from. */
export function listRunsForUniverse(universeId: string) {
  return listBulkScansForUniverse(universeId);
}

/**
 * Per-theme keyword count + total search volume across the *entire*
 * uploaded keyword list (not just the tracked subset) — this is what the
 * pre-run "here's your universe" overview is built from, and it's cheap:
 * one GROUP BY, no Claude calls, works the same whether the universe holds
 * 80 keywords or 10,000.
 */
export function getThemeSummary(universeId: string): ThemeSummaryRow[] {
  const rows = db
    .prepare(
      `SELECT
         COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') AS theme,
         COUNT(*) AS keyword_count,
         COALESCE(SUM(volume), 0) AS total_volume,
         SUM(tracked) AS tracked_count
       FROM universe_topics
       WHERE universe_id = ?
       GROUP BY theme
       ORDER BY total_volume DESC`
    )
    .all(universeId) as { theme: string; keyword_count: number; total_volume: number; tracked_count: number }[];

  const universe = db.prepare(`SELECT tracked_themes FROM universes WHERE id = ?`).get(universeId) as
    | { tracked_themes: string }
    | undefined;
  const trackedThemes = new Set(JSON.parse(universe?.tracked_themes || "[]") as string[]);

  return rows.map((r) => ({
    theme: r.theme,
    keywordCount: r.keyword_count,
    totalVolume: r.total_volume,
    tracked: trackedThemes.has(r.theme),
    trackedKeywordCount: r.tracked_count,
  }));
}

/**
 * The cheap categorization pass for a large raw upload: samples the
 * highest-volume keywords to propose a fixed theme list, then classifies
 * every keyword without an existing category against that list, in
 * batches. No web_search, no per-keyword call — cost is
 * O(sample) + O(total / batch size), not O(total).
 *
 * Meant to be called fire-and-forget right after createUniverse() when it
 * returned categorization_status = 'pending'. Safe to call on a universe
 * that's already 'complete' — it's a no-op (nothing left with a NULL
 * category).
 */
export async function runCategorization(universeId: string): Promise<void> {
  const universe = db.prepare(`SELECT brand, competitors FROM universes WHERE id = ?`).get(universeId) as
    | { brand: string; competitors: string }
    | undefined;
  if (!universe) return;

  db.prepare(`UPDATE universes SET categorization_status = 'running' WHERE id = ?`).run(universeId);

  try {
    const uncategorized = db
      .prepare(
        `SELECT id, topic, volume FROM universe_topics
         WHERE universe_id = ? AND (category IS NULL OR TRIM(category) = '')
         ORDER BY volume DESC, id ASC`
      )
      .all(universeId) as { id: number; topic: string; volume: number | null }[];

    if (uncategorized.length === 0) {
      db.prepare(`UPDATE universes SET categorization_status = 'complete' WHERE id = ?`).run(universeId);
      return;
    }

    const competitors = (JSON.parse(universe.competitors || "[]") as CompetitorInput[]).map((c) => c.name);
    const sample = uncategorized.slice(0, CATEGORIZE_SAMPLE_SIZE).map((r) => r.topic);
    const themes = await proposeThemes(sample, { brand: universe.brand, competitors });

    const updateCategory = db.prepare(`UPDATE universe_topics SET category = ? WHERE id = ?`);
    for (let i = 0; i < uncategorized.length; i += CATEGORIZE_BATCH_SIZE) {
      const batch = uncategorized.slice(i, i + CATEGORIZE_BATCH_SIZE);
      const assigned = await classifyKeywordsAgainstThemes(batch.map((r) => r.topic), themes);
      const updateMany = db.transaction(() => {
        batch.forEach((r, j) => updateCategory.run(assigned[j] || "Uncategorized", r.id));
      });
      updateMany();
    }

    db.prepare(`UPDATE universes SET categorization_status = 'complete' WHERE id = ?`).run(universeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare(`UPDATE universes SET categorization_status = 'error', categorization_error = ? WHERE id = ?`).run(
      message,
      universeId
    );
  }
}

/**
 * Sets which themes are opted in to be scanned — both "included the next
 * time you hit Run now" and "eligible for the weekly auto-run" read this
 * same list. Recomputes `tracked` on universe_topics immediately: for each
 * tracked theme, the top TOP_N_PER_THEME keywords by volume are marked
 * tracked = 1, everything else (including previously-tracked themes that
 * were just deselected) is reset to 0. This is what keeps a run's cost
 * bounded no matter how large the underlying universe is.
 */
export function setTrackedThemes(universeId: string, themes: string[]): void {
  const clean = Array.from(new Set(themes.map((t) => t.trim()).filter(Boolean)));

  const resetAll = db.prepare(`UPDATE universe_topics SET tracked = 0 WHERE universe_id = ?`);
  const selectTopN = db.prepare(
    `SELECT id FROM universe_topics
     WHERE universe_id = ? AND COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') = ?
     ORDER BY volume DESC, id ASC
     LIMIT ?`
  );
  const markTracked = db.prepare(`UPDATE universe_topics SET tracked = 1 WHERE id = ?`);
  const updateTrackedThemes = db.prepare(`UPDATE universes SET tracked_themes = ? WHERE id = ?`);

  const tx = db.transaction(() => {
    resetAll.run(universeId);
    for (const theme of clean) {
      const rows = selectTopN.all(universeId, theme, TOP_N_PER_THEME) as { id: number }[];
      rows.forEach((r) => markTracked.run(r.id));
    }
    updateTrackedThemes.run(JSON.stringify(clean), universeId);
  });
  tx();
}

export function setAutoRunEnabled(universeId: string, enabled: boolean): void {
  db.prepare(`UPDATE universes SET auto_run_enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, universeId);
}

/** Universes with auto-run on, at least one tracked theme, and either never
 * auto-run or last auto-run 7+ days ago — the weekly scheduler's query. */
export function listUniversesDueForAutoRun(): { id: string; userId: string | null }[] {
  const rows = db
    .prepare(
      `SELECT id, user_id FROM universes
       WHERE auto_run_enabled = 1
         AND tracked_themes != '[]'
         AND (last_auto_run_at IS NULL OR last_auto_run_at <= datetime('now', '-7 days'))`
    )
    .all() as { id: string; user_id: string | null }[];
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

export function markAutoRun(universeId: string): void {
  db.prepare(`UPDATE universes SET last_auto_run_at = datetime('now') WHERE id = ?`).run(universeId);
}

/**
 * Builds a BulkScanInput from the universe's currently *tracked* topics
 * only (no re-upload needed) — the bounded, cost-controlled set set up by
 * setTrackedThemes() — stamps universe_id on the new bulk_scans row, and
 * fires the run — same fire-and-forget pattern used by POST /api/bulk-scan.
 * Throws if nothing is tracked yet; the caller (API route) turns that into
 * a 400 asking the user to pick themes first.
 */
export function startUniverseRun(universeId: string, promptMode?: PromptMode, userId?: string | null): string {
  const universe = getUniverse(universeId);
  if (!universe) {
    throw new Error(`Universe ${universeId} not found.`);
  }
  if (universe.topics.length === 0) {
    throw new Error("No themes are tracked yet — pick at least one theme to track before running.");
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

  const runId = createBulkScan(input, universeId, userId);

  runBulkScan(runId, input).catch((err) => {
    console.error(`Universe run ${runId} (universe ${universeId}) failed:`, err);
  });

  return runId;
}
