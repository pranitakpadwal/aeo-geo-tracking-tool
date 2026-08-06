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
