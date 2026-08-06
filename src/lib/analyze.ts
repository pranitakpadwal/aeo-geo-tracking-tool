/**
 * Pure text analysis over a simulated AI-answer-engine response: does it
 * mention the brand (or its domain), how early, and which named competitors
 * also show up. No LLM call here — deterministic string matching so results
 * are reproducible and auditable.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(name: string): RegExp {
  // Word-boundary-ish match; tolerant of possessives/plurals immediately after.
  return new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "i");
}

function domainRootPattern(domain: string): RegExp | null {
  const root = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0];
  if (!root || root.length < 2) return null;
  return new RegExp(`\\b${escapeRegExp(root)}\\b`, "i");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface MentionResult {
  mentioned: boolean;
  position: number | null; // 0 (first sentence) .. 1 (last sentence)
}

export function findMention(responseText: string, name: string, domain?: string): MentionResult {
  const sentences = splitSentences(responseText);
  const brandRe = namePattern(name);
  const domainRe = domain ? domainRootPattern(domain) : null;

  for (let i = 0; i < sentences.length; i++) {
    if (brandRe.test(sentences[i]) || (domainRe && domainRe.test(sentences[i]))) {
      return {
        mentioned: true,
        position: sentences.length <= 1 ? 0 : i / (sentences.length - 1),
      };
    }
  }
  return { mentioned: false, position: null };
}

export function findCompetitorMentions(
  responseText: string,
  competitors: string[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of competitors) {
    const name = c.trim();
    if (!name) continue;
    out[name] = namePattern(name).test(responseText);
  }
  return out;
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Does a cited URL belong to this domain? Matches the domain itself or any
 * subdomain of it (e.g. "shop.nykaa.com" matches domain "nykaa.com"), but
 * not a domain that merely contains the string (e.g. "nykaa.com.fake-mirror.net").
 */
export function urlMatchesDomain(url: string, domain: string): boolean {
  const host = hostname(url);
  const target = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
  if (!host || !target) return false;
  return host === target || host.endsWith(`.${target}`);
}

export interface Citation {
  url: string;
  title: string | null;
}

export interface AttributedCitations {
  brandUrls: Citation[];
  competitorUrls: Record<string, Citation[]>; // keyed by competitor name
  other: Citation[]; // cited but matched neither the brand nor a listed competitor
}

/**
 * Sorts a response's real citation URLs into "belongs to the brand", "belongs
 * to a named competitor", or "other" (a third party, e.g. a review blog or
 * marketplace not in the tracked set).
 */
export function attributeCitations(
  citations: Citation[],
  brandDomain: string | undefined,
  competitors: { name: string; domain?: string }[]
): AttributedCitations {
  const brandUrls: Citation[] = [];
  const competitorUrls: Record<string, Citation[]> = {};
  const other: Citation[] = [];

  for (const c of competitors) {
    if (c.domain) competitorUrls[c.name] = [];
  }

  for (const citation of citations) {
    if (brandDomain && urlMatchesDomain(citation.url, brandDomain)) {
      brandUrls.push(citation);
      continue;
    }
    const match = competitors.find((c) => c.domain && urlMatchesDomain(citation.url, c.domain));
    if (match) {
      competitorUrls[match.name].push(citation);
      continue;
    }
    other.push(citation);
  }

  return { brandUrls, competitorUrls, other };
}
