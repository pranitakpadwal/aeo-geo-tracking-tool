import { getBulkScan, listBulkScansForBrand } from "./bulk-scan";
import type { BulkScanDetail } from "./types";

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
