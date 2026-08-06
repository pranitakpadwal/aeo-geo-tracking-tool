import type { SiteAudit, SiteAuditCheck } from "./types";

const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
];

function normalizeDomain(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return trimmed;
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "AEO-GEO-Tracker/1.0 (+audit)" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Best-effort, unauthenticated audit of a domain's readiness to be crawled
 * and cited by AI answer engines. Doesn't require an LLM call — just checks
 * the same public files/markup any answer engine's crawler would look at.
 */
export async function auditSite(domainInput: string): Promise<SiteAudit> {
  const domain = normalizeDomain(domainInput);
  const checks: SiteAuditCheck[] = [];

  const robotsText = await fetchText(`https://${domain}/robots.txt`);
  if (robotsText === null) {
    checks.push({
      id: "robots-reachable",
      label: "robots.txt is reachable",
      passed: false,
      detail: "Could not fetch robots.txt — site may be unreachable or blocking requests.",
    });
  } else {
    checks.push({
      id: "robots-reachable",
      label: "robots.txt is reachable",
      passed: true,
      detail: "robots.txt found.",
    });

    const blockedAgents = AI_CRAWLER_AGENTS.filter((agent) => {
      const re = new RegExp(`user-agent:\\s*${agent}[\\s\\S]*?disallow:\\s*/\\s*$`, "im");
      return re.test(robotsText);
    });
    checks.push({
      id: "ai-crawlers-allowed",
      label: "AI crawlers are not blocked in robots.txt",
      passed: blockedAgents.length === 0,
      detail:
        blockedAgents.length === 0
          ? "No AI answer-engine crawler (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, etc.) is disallowed."
          : `Blocking: ${blockedAgents.join(", ")}. These crawlers can't index this site for AI answers.`,
    });
  }

  const llmsTxt = await fetchText(`https://${domain}/llms.txt`);
  checks.push({
    id: "llms-txt",
    label: "llms.txt present",
    passed: llmsTxt !== null,
    detail:
      llmsTxt !== null
        ? "llms.txt found — gives AI crawlers a clean, plain-text summary of the site."
        : "No llms.txt found. This emerging convention gives answer engines a direct, low-noise summary instead of having to parse HTML.",
  });

  const homepage = await fetchText(`https://${domain}/`);
  if (homepage === null) {
    checks.push({
      id: "homepage-reachable",
      label: "Homepage is reachable",
      passed: false,
      detail: "Could not fetch the homepage over HTTPS.",
    });
  } else {
    checks.push({
      id: "homepage-reachable",
      label: "Homepage is reachable",
      passed: true,
      detail: "Homepage responded successfully.",
    });

    const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(homepage);
    checks.push({
      id: "structured-data",
      label: "Structured data (JSON-LD) present",
      passed: hasJsonLd,
      detail: hasJsonLd
        ? "Found JSON-LD structured data — helps answer engines parse facts about the business reliably."
        : "No JSON-LD structured data found. Organization/Product/FAQPage schema makes facts easy for AI crawlers to extract confidently.",
    });

    const hasFaqSchema = /"@type"\s*:\s*"FAQPage"/i.test(homepage);
    checks.push({
      id: "faq-schema",
      label: "FAQPage schema present",
      passed: hasFaqSchema,
      detail: hasFaqSchema
        ? "FAQPage schema found — a strong, direct-citation format for AI answer engines."
        : "No FAQPage schema detected on the homepage. Q&A-formatted content with FAQPage markup is one of the highest-yield formats for AI citation.",
    });

    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(homepage)?.[1]?.trim();
    checks.push({
      id: "title-tag",
      label: "Descriptive <title> tag",
      passed: Boolean(title && title.length > 10),
      detail: title
        ? `Title: "${title}"`
        : "No usable <title> tag found.",
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score = checks.length === 0 ? 0 : Math.round((passedCount / checks.length) * 100);

  return { domain, score, checks };
}
