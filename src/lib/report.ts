import { getBulkScan, listBulkScansForBrand, listBulkScansForUniverse } from "./bulk-scan";
import {
  buildCitedPagesSummary,
  buildThemeBreakdown,
  computeMovement,
  computeSiteReport,
  computeTopicReport,
  type BulkScanReport,
  type CitedPageEntry,
} from "./report-calc";

/**
 * Db-backed report builders — fetches a scan (and its run history, for
 * movement/previous-run diffing) and hands off to the pure aggregation math
 * in report-calc.ts. Server-only (bulk-scan.ts -> db.ts -> better-sqlite3),
 * so this file must not be imported from a client component; components
 * that only need the pure math (e.g. buildSummary on an already-fetched
 * report) should import report-calc.ts directly instead.
 */

// Re-exported so existing `import type { X } from "@/lib/report"` call
// sites (API routes, components) don't need to change.
export type {
  BrandCitationStats,
  BrandMovement,
  BulkScanReport,
  CitedPageEntry,
  Movement,
  ReportSummary,
  SiteReport,
  ThemeBreakdownRow,
  TopicReportRow,
} from "./report-calc";
export { buildCitedPagesSummary, buildSummary, buildThemeBreakdown } from "./report-calc";

/**
 * Builds the full report for one bulk scan, diffed against the run
 * immediately before it for the same brand+domain (if one exists) to
 * produce the movement numbers.
 */
export function buildReportForScan(scanId: string): BulkScanReport | null {
  const scan = getBulkScan(scanId);
  if (!scan || scan.status !== "complete") return null;

  const site = computeSiteReport(scan);
  const topics = computeTopicReport(scan);
  const themes = buildThemeBreakdown(scan);

  const history = listBulkScansForBrand(scan.brand, scan.domain);
  const idx = history.findIndex((h) => h.id === scan.id);
  const previousRecord = idx > 0 ? history[idx - 1] : null;
  const previousScan = previousRecord ? getBulkScan(previousRecord.id) : null;
  const movement = previousScan ? computeMovement(site, computeSiteReport(previousScan)) : null;

  return { site, topics, movement, themes };
}

export interface UniverseRunReport extends BulkScanReport {
  citedPages: CitedPageEntry[];
}

/**
 * Same report as buildReportForScan, plus the theme roll-up and cited-pages
 * leaderboard, diffed against the run immediately before this one *in this
 * universe's run history* (scoped by universe_id, not brand+domain string
 * match — a universe's identity is the row, not the strings on it).
 */
export function buildReportForUniverseRun(universeId: string, runId: string): UniverseRunReport | null {
  const scan = getBulkScan(runId);
  if (!scan || scan.status !== "complete") return null;

  const site = computeSiteReport(scan);
  const topics = computeTopicReport(scan);
  const themes = buildThemeBreakdown(scan);

  const history = listBulkScansForUniverse(universeId).filter((r) => r.status === "complete");
  const idx = history.findIndex((h) => h.id === scan.id);
  const previousRecord = idx > 0 ? history[idx - 1] : null;
  const previousScan = previousRecord ? getBulkScan(previousRecord.id) : null;
  const movement = previousScan ? computeMovement(site, computeSiteReport(previousScan)) : null;

  const citedPages = buildCitedPagesSummary(scan, previousScan);

  return { site, topics, movement, themes, citedPages };
}

export interface TrendPoint {
  runId: string;
  createdAt: string;
  scores: Record<string, number>; // brand name -> visibilityScore for that run
}

/**
 * Visibility score per brand across every completed run of a universe, in
 * order — the series the trend chart plots and the "this is run #N, moving
 * up/down over time" language in the summary reads from. Grows richer with
 * every run instead of only ever comparing to the single previous one.
 */
export function buildTrendForUniverse(universeId: string): TrendPoint[] {
  const runs = listBulkScansForUniverse(universeId).filter((r) => r.status === "complete");
  return runs
    .map((r) => {
      const scan = getBulkScan(r.id);
      if (!scan) return null;
      const site = computeSiteReport(scan);
      const scores: Record<string, number> = {};
      site.brands.forEach((b) => {
        scores[b.name] = b.visibilityScore;
      });
      return { runId: r.id, createdAt: r.createdAt, scores };
    })
    .filter((p): p is TrendPoint => p !== null);
}
