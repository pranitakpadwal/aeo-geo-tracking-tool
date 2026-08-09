export interface ScanInput {
  brand: string;
  domain?: string;
  industry: string;
  competitors: string[];
  customPrompts: string[];
}

export interface ScanRecord {
  id: string;
  brand: string;
  domain: string | null;
  industry: string;
  competitors: string[];
  status: "pending" | "running" | "complete" | "error";
  error: string | null;
  siteAudit: SiteAudit | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PromptResult {
  promptId: number;
  prompt: string;
  source: "generated" | "custom";
  responseText: string;
  brandMentioned: boolean;
  brandPosition: number | null; // 0..1, how early the brand appears (0 = first sentence)
  competitorsMentioned: Record<string, boolean>;
}

export interface ScanDetail extends ScanRecord {
  results: PromptResult[];
}

export interface SiteAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SiteAudit {
  domain: string;
  score: number; // 0-100
  checks: SiteAuditCheck[];
}

// --- Bulk scans: a large imported topic/keyword list run through the same
// citation check as a manual scan, one topic per row, grounded with real web
// search so results carry actual cited URLs (not just name mentions). ---

export interface CompetitorInput {
  name: string;
  domain?: string; // needed for citation-URL attribution; mention detection works without it
}

export interface BulkScanTopicInput {
  topic: string;
  type?: string; // content-strategy label from the import (e.g. "Baseline", "New Product/Ingredient")
  category?: string; // the real sub-vertical (e.g. "Skincare", "Lips", "Hair Care") — what theme breakdowns group by
  priorityTier?: string;
  volume?: number;
}

// "question" (default): rewrite each keyword into a natural shopper
// question before asking Claude — e.g. "shampoo" -> "what's the best
// shampoo for dry hair". "keyword": skip the rewrite and send the raw
// keyword/topic string to Claude as the prompt, verbatim, so you can see
// how visibility/mentions/citations/cited-pages differ from the rewritten
// version for the exact same topic list.
export type PromptMode = "question" | "keyword";

export interface BulkScanInput {
  brand: string;
  domain?: string;
  competitors: CompetitorInput[];
  topics: BulkScanTopicInput[];
  promptMode?: PromptMode;
}

export interface BulkScanRecord {
  id: string;
  brand: string;
  domain: string | null;
  competitors: CompetitorInput[];
  status: "pending" | "running" | "complete" | "error";
  error: string | null;
  totalTopics: number;
  completedTopics: number;
  createdAt: string;
  completedAt: string | null;
  universeId: string | null; // set when this run belongs to a persistent Universe, null for one-off bulk scans
  promptMode: PromptMode;
}

export interface CitationRef {
  url: string;
  title: string | null;
}

export interface BulkScanTopicResult {
  id: number;
  idx: number;
  topic: string;
  type: string | null;
  category: string | null;
  priorityTier: string | null;
  volume: number | null;
  question: string | null;
  responseText: string | null;
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorsMentioned: Record<string, boolean>;
  brandCitations: CitationRef[];
  competitorCitations: Record<string, CitationRef[]>;
  otherCitations: CitationRef[];
  status: "pending" | "done" | "error";
  error: string | null;
}

export interface BulkScanDetail extends BulkScanRecord {
  topics: BulkScanTopicResult[];
}

// --- Universes: a persistent brand+category tracker. Set up once (brand,
// domain, competitors, fixed topic list), then re-run over time — each run
// is a bulk_scans row (with universe_id set) so history/trend compounds. ---

export interface UniverseTopicInput {
  topic: string;
  type?: string;
  category?: string; // the real sub-vertical (e.g. "Skincare", "Lips") — what theme breakdowns group by
  priorityTier?: string;
  volume?: number;
}

export interface UniverseInput {
  name: string;
  brand: string;
  domain?: string;
  competitors: CompetitorInput[];
  topics: UniverseTopicInput[];
}

export interface UniverseTopicRecord extends UniverseTopicInput {
  id: number;
  universeId: string;
}

export interface Universe {
  id: string;
  name: string;
  brand: string;
  domain: string | null;
  competitors: CompetitorInput[];
  createdAt: string;
}

export interface UniverseRunSummary {
  id: string;
  status: BulkScanRecord["status"];
  createdAt: string;
  completedAt: string | null;
  promptMode: PromptMode;
}

export interface UniverseDetail extends Universe {
  topics: UniverseTopicRecord[];
  topicCount: number;
  runs: UniverseRunSummary[];
  latestRunId: string | null;
}
