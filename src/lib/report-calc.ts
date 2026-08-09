import type { BulkScanDetail, CitationRef } from "./types";

/**
 * Pure report-aggregation math — everything here takes an already-fetched
 * BulkScanDetail and returns plain data, no database access. Split out from
 * report.ts (which adds the db-backed lookups: fetching a scan by id,
 * walking run history for movement/previous-run diffing) so this half is
 * safe to import from a client component — report.ts pulls in bulk-scan.ts
 * -> db.ts (better-sqlite3), which can't go in a browser bundle.
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
  visibilityScore: number; // 0-100, weighted mentionRate/citationRate — see round1(...) call site for the weights
}

/** Single score to rank/compare brands by, without forcing a reader to
 * weigh mention rate vs citation rate themselves. Citation rate is weighted
 * higher (0.6) than mention rate (0.4) — a real cited URL is the harder,
 * more business-relevant signal (it's a click-through surface), a mention
 * alone is reach/share. */
function visibilityScore(mentionRate: number, citationRate: number): number {
  return round1(mentionRate * 0.4 + citationRate * 0.6);
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
  themes: ThemeBreakdownRow[];
}

// --- Universe roll-ups: same source data as the topic report, grouped up a
// level to "here's the category, here's the themes moving up/down" instead
// of a flat topic list. Pure functions over an already-fetched scan — no
// extra LLM calls. ---

export interface ThemeBreakdownRow {
  theme: string; // the `category` (sub-vertical) the user supplied, falling back to `type`, falling back to Claude auto-grouping if neither was set
  topicsCount: number;
  leader: string | null;
  perBrand: Record<
    string,
    { mentions: number; citations: number; mentionRate: number; citationRate: number; visibilityScore: number }
  >;
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
 * Groups by the `category` field, which is either the user-supplied real
 * sub-vertical, or — when nobody supplied one at all — a theme Claude
 * auto-assigned at scan time (see autoGroupIfUncategorized() in
 * bulk-scan.ts). Falls back further to `type` only in the unlikely case
 * neither exists, so the breakdown still means something rather than being
 * empty.
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
    const perBrand: ThemeBreakdownRow["perBrand"] = {};
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
      const mentionRate = topics.length ? round1((mentions / topics.length) * 100) : 0;
      const citationRate = topics.length ? round1((citations / topics.length) * 100) : 0;
      perBrand[name] = { mentions, citations, mentionRate, citationRate, visibilityScore: visibilityScore(mentionRate, citationRate) };
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

export function computeSiteReport(scan: BulkScanDetail): SiteReport {
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

    const mentionRate = total ? round1((mentions / total) * 100) : 0;
    const citationRate = total ? round1((citations / total) * 100) : 0;

    return {
      name,
      domain: isBrand ? scan.domain ?? undefined : scan.competitors.find((c) => c.name === name)?.domain,
      isBrand,
      promptsTotal: total,
      mentions,
      mentionRate,
      citations,
      citationRate,
      distinctCitedUrls: Array.from(urlSet),
      visibilityScore: visibilityScore(mentionRate, citationRate),
    };
  });

  const totalCitations = brands.reduce((s, b) => s + b.citations, 0);
  const shareOfCitations: Record<string, number> = {};
  for (const b of brands) {
    shareOfCitations[b.name] = totalCitations ? round1((b.citations / totalCitations) * 100) : 0;
  }

  return { scanId: scan.id, createdAt: scan.createdAt, totalTopics: total, brands, shareOfCitations };
}

export function computeTopicReport(scan: BulkScanDetail): TopicReportRow[] {
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

export function computeMovement(current: SiteReport, previous: SiteReport): Movement {
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

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ReportSummary {
  brand: string;
  totalTopics: number;
  totalBrandsTracked: number;
  overallLeader: string;
  overallLeaderScore: number;
  brandRank: number; // 1-indexed — 1 means brand is the overall leader
  brandVisibilityScore: number;
  gapToLeader: number; // score points behind the leader; 0 if brand is the leader
  strongestTheme: { theme: string; score: number } | null; // brand's best-scoring theme
  weakestTheme: { theme: string; score: number } | null; // brand's worst-scoring theme (only among themes it has topics in)
  biggestMover: { brand: string; citationRateDelta: number } | null; // largest |delta| among all brands, vs. previous run
}

/**
 * Headline numbers for the top of a report — no LLM call, purely computed
 * from the same site/theme data already on the report. Answers "where do I
 * stand, and by how much" in one glance before the reader gets to the
 * tables.
 */
export function buildSummary(report: BulkScanReport): ReportSummary {
  const { site, themes, movement } = report;
  const brandStats = site.brands.find((b) => b.isBrand)!;

  const ranked = [...site.brands].sort((a, b) => b.visibilityScore - a.visibilityScore);
  const overallLeader = ranked[0];
  const brandRank = ranked.findIndex((b) => b.isBrand) + 1;

  let strongestTheme: ReportSummary["strongestTheme"] = null;
  let weakestTheme: ReportSummary["weakestTheme"] = null;
  for (const t of themes) {
    const s = t.perBrand[brandStats.name];
    if (!s || t.topicsCount === 0) continue;
    if (!strongestTheme || s.visibilityScore > strongestTheme.score) strongestTheme = { theme: t.theme, score: s.visibilityScore };
    if (!weakestTheme || s.visibilityScore < weakestTheme.score) weakestTheme = { theme: t.theme, score: s.visibilityScore };
  }

  let biggestMover: ReportSummary["biggestMover"] = null;
  if (movement) {
    for (const [name, d] of Object.entries(movement.brandDeltas)) {
      if (!biggestMover || Math.abs(d.citationRateDelta) > Math.abs(biggestMover.citationRateDelta)) {
        biggestMover = { brand: name, citationRateDelta: d.citationRateDelta };
      }
    }
  }

  return {
    brand: brandStats.name,
    totalTopics: site.totalTopics,
    totalBrandsTracked: site.brands.length,
    overallLeader: overallLeader.name,
    overallLeaderScore: overallLeader.visibilityScore,
    brandRank,
    brandVisibilityScore: brandStats.visibilityScore,
    gapToLeader: round1(overallLeader.visibilityScore - brandStats.visibilityScore),
    strongestTheme,
    weakestTheme,
    biggestMover,
  };
}
