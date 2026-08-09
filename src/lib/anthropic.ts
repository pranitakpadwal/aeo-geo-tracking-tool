import Anthropic from "@anthropic-ai/sdk";

// Model used for every call this app makes to Claude. Override via env if
// you want to trade cost for depth (e.g. claude-sonnet-5 for cheaper scans).
const MODEL = process.env.AEO_MODEL || "claude-opus-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Ask Claude to generate a set of realistic, high-intent questions a
 * prospective customer might type into an AI assistant (ChatGPT, Perplexity,
 * Google AI Overview, Claude, etc.) that a business in this niche should
 * ideally be cited for.
 */
export async function generatePrompts(opts: {
  brand: string;
  industry: string;
  domain?: string;
  count: number;
}): Promise<string[]> {
  const { brand, industry, domain, count } = opts;
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["prompts"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          `You are helping "${brand}" (industry: ${industry}${domain ? `, website: ${domain}` : ""}) understand what real customers ask AI assistants like ChatGPT, Perplexity, Google AI Overviews, and Claude when researching this space.`,
          `Generate ${count} distinct, realistic questions a prospective customer would type into one of those assistants — the kind of question where a good answer would name specific companies or products, not a generic explainer question.`,
          `Mix question types: some naming the category broadly ("best X for Y"), some comparison-shaped ("X vs Y"), some "who is the top provider of X".`,
          `Do not mention "${brand}" by name in the questions themselves — these represent what an independent researcher would ask.`,
        ].join("\n"),
      },
    ],
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as { prompts: string[] };
  return parsed.prompts.slice(0, count);
}

/**
 * Simulate what an AI answer engine would say in response to a prompt, as a
 * plain, direct, well-researched answer — the same shape ChatGPT/Perplexity
 * would give a real user asking this question.
 */
export async function answerPrompt(prompt: string): Promise<string> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          "Answer the following question the way a knowledgeable, well-researched AI assistant would answer a real user — a direct, informative answer that names specific real companies, products, or providers where relevant, the way ChatGPT, Perplexity, or Google's AI Overview would.",
          "Do not mention that you are an AI, do not add disclaimers, do not ask clarifying questions — just answer as if this is the final response shown to the user.",
          "",
          `Question: ${prompt}`,
        ].join("\n"),
      },
    ],
  });
  return extractText(response);
}

function extractText(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return block.text;
}

/**
 * Convert a batch of raw topics/keywords into natural-language, buying-intent
 * questions — the shape a real shopper would type into an AI assistant, not
 * the bare keyword itself. Kept as one call per batch (not per topic) to
 * control cost on large imports.
 */
export async function generateTopicQuestions(topics: string[]): Promise<string[]> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            questions: { type: "array", items: { type: "string" } },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          "Below is a numbered list of product/category topics from a keyword-research export (a beauty & personal care retailer's search-volume analysis).",
          "For each one, write ONE realistic, natural-language question a shopper would type into an AI assistant (ChatGPT, Perplexity, Google AI Overview) when researching that topic with buying intent — e.g. \"best sunscreen for oily skin\" rather than just \"sunscreen\", \"where can I buy Cetaphil face wash online in India\" rather than just \"Cetaphil\".",
          "Return exactly one question per topic, in the same order, as a JSON array of strings — no numbering, no extra commentary.",
          "",
          topics.map((t, i) => `${i + 1}. ${t}`).join("\n"),
        ].join("\n"),
      },
    ],
  });
  const text = extractText(response);
  const parsed = JSON.parse(text) as { questions: string[] };
  return parsed.questions;
}

/**
 * Auto-groups a flat list of topics/queries into a small number of coherent
 * themes — the "upload 100 keywords, we cluster them into ~5 groups so you
 * can compare visibility score/mentions/citations/cited pages by group"
 * behavior. Used whenever a topic list comes in with no `category` column,
 * so grouping doesn't require the user to hand-label anything first.
 *
 * Returns one theme name per input topic, same order/length as `topics`.
 * `targetGroups` is a target, not a hard cap — Claude may return slightly
 * more/fewer if the topics don't cleanly split that way (e.g. a very small
 * or very homogeneous list).
 */
export async function groupTopicsIntoThemes(topics: string[], targetGroups = 5): Promise<string[]> {
  if (topics.length === 0) return [];

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            themeNames: {
              type: "array",
              items: { type: "string" },
              description: `Short, human-readable theme/group names (aim for around ${targetGroups}), e.g. "Skincare", "Hair Care", "Fragrance".`,
            },
            assignments: {
              type: "array",
              items: { type: "integer" },
              description:
                "One entry per input topic, in the same order — the 0-based index into themeNames that topic belongs to.",
            },
          },
          required: ["themeNames", "assignments"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          `Below is a numbered list of ${topics.length} product/topic queries from a keyword-research export.`,
          `Group them into around ${targetGroups} coherent themes based on what they're actually about (e.g. "Skincare", "Hair Care", "Fragrance", "Makeup") — fewer or more is fine if the data doesn't split evenly, but stay close to ${targetGroups} unless the list clearly needs otherwise.`,
          `Every topic must be assigned to exactly one theme. Use concise, human-readable theme names a brand owner would recognize.`,
          "",
          topics.map((t, i) => `${i + 1}. ${t}`).join("\n"),
        ].join("\n"),
      },
    ],
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as { themeNames: string[]; assignments: number[] };
  return topics.map((_, i) => {
    const idx = parsed.assignments[i];
    return parsed.themeNames[idx] ?? "Uncategorized";
  });
}

/**
 * Proposes a fixed, small theme list for a large raw keyword upload (up to
 * thousands of rows) — the first half of the two-step "categorize cheaply,
 * then let the user pick what to scan" pipeline for big imports. Looks at a
 * representative sample (not the whole list — that's the cost control) and
 * always includes a "Brand" theme so brand-name/competitor-name keywords
 * have somewhere to land distinct from real product categories.
 *
 * No web_search tool here and no per-keyword call — this is one call total,
 * regardless of how many thousand keywords are being categorized.
 */
export async function proposeThemes(
  sampleKeywords: string[],
  opts: { brand: string; competitors: string[] }
): Promise<string[]> {
  if (sampleKeywords.length === 0) return ["Brand"];

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            themes: {
              type: "array",
              items: { type: "string" },
              description:
                'Short, human-readable category names a brand owner would recognize (e.g. "Skincare", "Hair Care", "Fragrance"). Do NOT include a "Brand" theme — that is added automatically.',
            },
          },
          required: ["themes"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          `Below is a sample of ${sampleKeywords.length} keywords from a larger keyword-research export for "${opts.brand}" (competitors: ${opts.competitors.join(", ") || "none listed"}).`,
          `Propose a small, fixed set of product/topic categories (aim for 8-15) that would cleanly cover this whole space — real sub-verticals a brand owner would recognize, not generic labels. Every keyword in the full export will later be sorted into one of these categories, so make them broad enough to not leave obvious gaps, but specific enough to be useful (e.g. "Skincare" and "Hair Care" as separate categories, not one combined "Beauty" category).`,
          `Do not propose a "Brand" or "Branded" category — that bucket (for keywords that are just the brand's own name or a named competitor) is added automatically, don't duplicate it.`,
          "",
          sampleKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n"),
        ].join("\n"),
      },
    ],
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as { themes: string[] };
  const themes = parsed.themes.filter((t) => t.trim() && t.trim().toLowerCase() !== "brand");
  return ["Brand", ...themes];
}

/**
 * Classifies a batch of keywords against a fixed theme list (from
 * proposeThemes) — the second half of the large-upload categorization
 * pipeline. Every batch is classified against the *same* theme list, so
 * results stay consistent across a 10,000-row upload instead of each batch
 * inventing its own categories. No web_search — this is a plain
 * classification call, batched to control call count on large imports.
 *
 * Returns one entry per input keyword, same order — `null` where Claude
 * didn't return a valid assignment for that keyword (rather than guessing
 * "Uncategorized"), so the caller can retry just those instead of quietly
 * mass-mislabeling.
 *
 * The response schema pairs each assignment with the keyword's own number
 * ({i, t}, not a bare positional array) deliberately: a plain
 * one-integer-per-position array is fragile at batch sizes like 50-100 —
 * if the model skips or double-counts even one item, every assignment
 * after that point silently shifts out of alignment with the wrong
 * keyword, cascading into a batch that's mostly wrong instead of mostly
 * right. Keying by explicit keyword number is self-correcting: a skipped
 * item just leaves one gap (retried), not a cascade.
 */
export async function classifyKeywordsAgainstThemes(keywords: string[], themes: string[]): Promise<(string | null)[]> {
  if (keywords.length === 0) return [];

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8192,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  i: { type: "integer", description: "The keyword's number from the input list below (1-based)." },
                  t: { type: "integer", description: "0-based index into the theme list this keyword belongs to." },
                },
                required: ["i", "t"],
                additionalProperties: false,
              },
            },
          },
          required: ["assignments"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          `Themes (0-indexed):`,
          themes.map((t, i) => `${i}. ${t}`).join("\n"),
          "",
          `Classify each of the following ${keywords.length} keywords into exactly one of the themes above. Return one {i, t} pair per keyword — i is that keyword's number below, t is the theme's index. A keyword that is just a brand name (the site's own brand, or a named competitor) goes to the "Brand" theme; otherwise pick whichever theme it's most clearly about. Every keyword must get exactly one pair.`,
          "",
          keywords.map((k, i) => `${i + 1}. ${k}`).join("\n"),
        ].join("\n"),
      },
    ],
  });

  const text = extractText(response);
  const parsed = JSON.parse(text) as { assignments: { i: number; t: number }[] };

  const byIndex = new Map<number, number>();
  for (const a of parsed.assignments) byIndex.set(a.i, a.t);

  return keywords.map((_, i) => {
    const themeIdx = byIndex.get(i + 1);
    return themeIdx !== undefined ? (themes[themeIdx] ?? null) : null;
  });
}

export interface GroundedAnswer {
  text: string;
  citations: { url: string; title: string | null }[];
}

/**
 * Same idea as answerPrompt, but grounded with Claude's web_search tool so
 * the response carries real, checkable citation URLs instead of an
 * ungrounded simulation. This is what makes "cited URL" tracking honest —
 * answerPrompt() alone can never produce a real URL because it never looks
 * anything up.
 */
export async function answerPromptGrounded(prompt: string): Promise<GroundedAnswer> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1536,
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content: [
          "Answer the following question the way a knowledgeable AI assistant would answer a real shopper — search the web if it helps, then give a direct, informative answer naming specific real companies, products, retailers, or brands where relevant, the way ChatGPT, Perplexity, or Google's AI Overview would.",
          "Do not mention that you are an AI, do not add disclaimers, do not ask clarifying questions — just answer as if this is the final response shown to the user.",
          "",
          `Question: ${prompt}`,
        ].join("\n"),
      },
    ],
  });

  const textParts: string[] = [];
  const citations = new Map<string, { url: string; title: string | null }>();

  for (const block of response.content) {
    if (block.type !== "text") continue;
    textParts.push(block.text);
    for (const citation of block.citations ?? []) {
      if (citation.type === "web_search_result_location" && citation.url) {
        if (!citations.has(citation.url)) {
          citations.set(citation.url, { url: citation.url, title: citation.title ?? null });
        }
      }
    }
  }

  if (textParts.length === 0) {
    throw new Error("Claude returned no text content");
  }

  return { text: textParts.join("\n\n"), citations: Array.from(citations.values()) };
}
