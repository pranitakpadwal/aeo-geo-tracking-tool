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
