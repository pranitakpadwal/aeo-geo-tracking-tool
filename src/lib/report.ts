import { getBulkScan, listBulkScansForBrand, listBulkScansForUniverse } from "./bulk-scan";
import type { BulkScanDetail, CitationRef } from "./types";

/**
 * Aggregation layer for the AEO/GEO citation report, built entirely from
 * data already stored on a completed bulk scan — no extra LLM calls. See
 * README "Report definitions" for what each metric means and why.
 */

export interface BrandCitationStats {
  name: string;
  domain?: string;
  isBrand: boolean;
  promptsTotal: number;
  mentions: number;
  mentionRate: number; // %, 0-100
  citations: number; // prompts where a real cited URL matched this brand/competitor's domain
  citationRate: number; // %, 0-100
  distinctCitedUrls: string[];
}

export interface SiteReport {
  scanId: string;
  createdAt: string;
  totalTopics: number;
  brands: BrandCitationStats[]; // brand first, then competitors in input order
  shareOfCitations: Record<string, number>; // % of all tracked citations, across brand+competitors
}

export interface TopicReportRow {
  topic: string;
  type: string | null;
  priorityTier: string | null;
  volume: number | null;
  leader: string | null; // name with the most citations for this topic (mentions as tiebreak); null if nobody showed up
  perBrand: Record<string, { mentioned: boolean; citations: number }>;
}

export interface BrandMovement {
  mentionRateDelta: number; // percentage points vs. the previous run
  citationRateDelta: number;
}

export interface Movement {
  previousScanId: string;
  previousCreatedAt: string;
  brandDeltas: Record<string, BrandMovement>;
}

export interface BulkScanReport {
  site: SiteReport;
  topics: TopicReportRow[];
  movement: Movement | null;
}

// --- Universe roll-ups: same source data as the topic report, grouped up a
// level to "here's the category, here's the themes moving up/down" instead
// of a flat topic list. Pure functions over an already-fetched scan — no
// extra LLM calls. ---

export interface ThemeBreakdownRow {
  theme: string; // the `category` (sub-vertical) the user supplied, falling back to `type` if no category was imported
  topicsCount: number;
  leader: string | null;
  perBrand: Record<string, { mentions: number; citations: number }>;
}

export interface CitedPageEntry {
  url: string;
  title: string | null;
  brand: string; // which brand/competitor this citation belongs to
  topicsCiting: number; // how many topics in this run cited this URL for this brand
  status: "new" | "continuing" | "lost" | null; // null when there's no previous run to diff against
}

/**
 * Groups topics into sub-vertical themes (e.g. Skincare, Lips, Hair Care —
 * the breakdown under a universe's parent category, "Beauty") and rolls
 * mentions/citations/leader up to that theme, same shape as the per-topic
 * report.
 *
 * Groups by the user-supplied `category` field when present — that's the
 * real sub-vertical. Falls back to `type` (usually a content-strategy label
 * like "Baseline"/"New Product") only when no category was imported, so the
 * breakdown still means something rather than being empty.
 */
export function buildThemeBreakdown(scan: BulkScanDetail): ThemeBreakdownRow[] {
  const names = [scan.brand, ...scan.competitors.map((c) => c.name)];

  const groups = new Map<string, BulkScanDetail["topics"]>();
  for (const t of scan.topics) {
    const theme = t.category?.trim() || t.type?.trim() || "Uncategorized";
    if (!groups.has(theme)) groups.set(theme, []);
    groups.get(theme)!.push(t);
  }

  const rows: ThemeBreakdownRow[] = [];
  for (const [theme, topics] of groups) {
    const perBrand: Record<string, { mentions: number; citations: number }> = {};
    for (const name of names) {
      let mentions = 0;
      let citations = 0;
      for (const t of topics) {
        if (name === scan.brand) {
          if (t.brandMentioned) mentions++;
          if (t.brandCitations.length > 0) citations++;
        } else {
          if (t.competitorsMentioned[name]) mentions++;
          if ((t.competitorCitations[name] || []).length > 0) citations++;
        }
      }
      perBrand[name] = { mentions, citations };
    }

    let leader: string | null = null;
    let best = -1;
    for (const name of names) {
      if (perBrand[name].citations > best) {
        best = perBrand[name].citations;
        leader = name;
      }
    }
    if (best <= 0) leader = null;

    rows.push({ theme, topicsCount: topics.length, leader, perBrand });
  }

  return rows.sort((a, b) => b.topicsCount - a.topicsCount);
}

/** Per-brand map of cited URL -> { title, how many topics cited it }. */
function collectCitedUrls(scan: BulkScanDetail): Map<string, Map<string, { title: string | null; count: number }>> {
  const names = [scan.brand, ...scan.competitors.map((c) => c.name)];
  const byBrand = new Map<string, Map<string, { title: string | null; count: number }>>();
  for (const name of names) byBrand.set(name, new Map());

  for (const t of scan.topics) {
    for (const name of names) {
      const urls: CitationRef[] = name === scan.brand ? t.brandCitations : t.competitorCitations[name] || [];
      const map = byBrand.get(name)!;
      for (const c of urls) {
        const existing = map.get(c.url);
        if (existing) existing.count++;
        else map.set(c.url, { title: c.title, count: 1 });
      }
    }
  }
  return byBrand;
}

/**
 * Leaderboard of every distinct cited URL per brand, ranked by how many
 * topics cited it in this run. When a previous run (same universe) is
 * supplied, each URL is also tagged new/continuing/lost since that run.
 */
export function buildCitedPagesSummary(scan: BulkScanDetail, previousScan?: BulkScanDetail | null): CitedPageEntry[] {
  const names = [scan.brand, ...scan.competitors.map((c) => c.name)];
  const current = collectCitedUrls(scan);
  const previous = previousScan ? collectCitedUrls(previousScan) : null;

  const rows: CitedPageEntry[] = [];
  for (const name of names) {
    const curMap = current.get(name) || new Map();
    const prevMap = previous?.get(name);

    for (const [url, { title, count }] of curMap) {
      const status: CitedPageEntry["status"] = previous ? (prevMap?.has(url) ? "continuing" : "new") : null;
      rows.push({ url, title, brand: name, topicsCiting: count, status });
    }

    if (prevMap) {
      for (const [url, { title }] of prevMap) {
        if (!curMap.has(url)) {
          rows.push({ url, title, brand: name, topicsCiting: 0, status: "lost" });
        }
      }
    }
  }

  const brandOrder = new Map(names.map((n, i) => [n, i]));
  rows.sort((a, b) => (brandOrder.get(a.brand)! - brandOrder.get(b.brand)!) || b.topicsCiting - a.topicsCiting);
  return rows;
}

function computeSiteReport(scan: BulkScanDetail): SiteReport {
  const names = [scan.brand, ...scan.competitors.map((c) => c.name)];
  const total = scan.topics.length;

  const brands: BrandCitationStats[] = names.map((name, i) => {
    const isBrand = i === 0;
    let mentions = 0;
    let citations = 0;
    const urlSet = new Set<string>();

    for (const t of scan.topics) {
      if (isBrand) {
        if (t.brandMentioned) mentions++;
        if (t.brandCitations.length > 0) {
          citations++;
          t.brandCitations.forEach((c) => urlSet.add(c.url));
        }
      } else {
        if (t.competitorsMentioned[name]) mentions++;
        const urls = t.competitorCitations[name] || [];
        if (urls.length > 0) {
          citations++;
          urls.forEach((c) => urlSet.add(c.url));
        }
      }
    }

    return {
      name,
      domain: isBrand ? scan.domain ?? undefined : scan.competitors.find((c) => c.name === name)?.domain,
      isBrand,
      promptsTotal: total,
      mentions,
      mentionRate: total ? round1((mentions / total) * 100) : 0,
      citations,
      citationRate: total ? round1((citations / total) * 100) : 0,
      distinctCitedUrls: Array.from(urlSet),
    };
  });

  const totalCitations = brands.reduce((s, b) => s + b.citations, 0);
  const shareOfCitations: Record<string, number> = {};
  for (const b of brands) {
    shareOfCitations[b.name] = totalCitations ? round1((b.citations / totalCitations) * 100) : 0;
  }

  return { scanId: scan.id, createdAt: scan.createdAt, totalTopics: total, brands, shareOfCitations };
}

function computeTopicReport(scan: BulkScanDetail): TopicReportRow[] {
  const names = [scan.brand, ...scan.competitors.map((c) => c.name)];

  return scan.topics.map((t) => {
    const perBrand: Record<string, { mentioned: boolean; citations: number }> = {};
    for (const name of names) {
      perBrand[name] =
        name === scan.brand
          ? { mentioned: t.brandMentioned, citations: t.brandCitations.length }
          : {
              mentioned: Boolean(t.competitorsMentioned[name]),
              citations: (t.competitorCitations[name] || []).length,
            };
    }

    let leader: string | null = null;
    let best = { citations: -1, mentioned: false };
    for (const name of names) {
      const v = perBrand[name];
      const better = v.citations > best.citations || (v.citations === best.citations && v.mentioned && !best.mentioned);
      if (better) {
        best = v;
        leader = name;
      }
    }
    if (best.citations <= 0 && !best.mentioned) leader = null;

    return { topic: t.topic, type: t.type, priorityTier: t.priorityTier, volume: t.volume, leader, perBrand };
  });
}

function computeMovement(current: SiteReport, previous: SiteReport): Movement {
  const brandDeltas: Record<string, BrandMovement> = {};
  for (const b of current.brands) {
    const prev = previous.brands.find((p) => p.name === b.name);
    brandDeltas[b.name] = {
      mentionRateDelta: round1(b.mentionRate - (prev?.mentionRate ?? 0)),
      citationRateDelta: round1(b.citationRate - (prev?.citationRate ?? 0)),
    };
  }
  return { previousScanId: previous.scanId, previousCreatedAt: previous.createdAt, brandDeltas };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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

  const history = listBulkScansForBrand(scan.brand, scan.domain);
  const idx = history.findIndex((h) => h.id === scan.id);
  const previousRecord = idx > 0 ? history[idx - 1] : null;
  const previousScan = previousRecord ? getBulkScan(previousRecord.id) : null;
  const movement = previousScan ? computeMovement(site, computeSiteReport(previousScan)) : null;

  return { site, topics, movement };
}

export interface UniverseRunReport extends BulkScanReport {
  themes: ThemeBreakdownRow[];
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

  const history = listBulkScansForUniverse(universeId).filter((r) => r.status === "complete");
  const idx = history.findIndex((h) => h.id === scan.id);
  const previousRecord = idx > 0 ? history[idx - 1] : null;
  const previousScan = previousRecord ? getBulkScan(previousRecord.id) : null;
  const movement = previousScan ? computeMovement(site, computeSiteReport(previousScan)) : null;

  const themes = buildThemeBreakdown(scan);
  const citedPages = buildCitedPagesSummary(scan, previousScan);

  return { site, topics, movement, themes, citedPages };
}
