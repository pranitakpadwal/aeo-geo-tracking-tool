import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { createUniverse, startUniverseRun } from "@/lib/universe";
import type { UniverseInput } from "@/lib/types";

const MAX_TOPICS = 500;

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this server." },
      { status: 503 }
    );
  }

  let body: Partial<UniverseInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const brand = (body.brand || "").trim();
  const domain = (body.domain || "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!brand) {
    return NextResponse.json({ error: "brand is required." }, { status: 400 });
  }
  if (!domain) {
    return NextResponse.json(
      { error: "domain is required for universes — citation URLs are matched against it." },
      { status: 400 }
    );
  }

  const topics = Array.isArray(body.topics)
    ? body.topics
        .map((t) => ({
          topic: String(t.topic || "").trim(),
          type: t.type ? String(t.type).trim() : undefined,
          priorityTier: t.priorityTier ? String(t.priorityTier).trim() : undefined,
          volume: typeof t.volume === "number" ? t.volume : undefined,
        }))
        .filter((t) => t.topic)
    : [];

  if (topics.length === 0) {
    return NextResponse.json({ error: "At least one topic is required." }, { status: 400 });
  }
  if (topics.length > MAX_TOPICS) {
    return NextResponse.json(
      { error: `Too many topics (${topics.length}). Cap is ${MAX_TOPICS} per run — split into batches.` },
      { status: 400 }
    );
  }

  const competitors = Array.isArray(body.competitors)
    ? body.competitors
        .map((c) => ({
          name: String(c.name || "").trim(),
          domain: c.domain ? String(c.domain).trim() : undefined,
        }))
        .filter((c) => c.name)
        .slice(0, 10)
    : [];

  const input: UniverseInput = { name, brand, domain, competitors, topics };
  const id = createUniverse(input);

  // Fire-and-forget, same pattern as POST /api/bulk-scan: this process is a
  // persistent Node server, so the run keeps going after we respond. A
  // client polls GET /api/universe/[id]/run/[runId]/report for progress.
  const runId = startUniverseRun(id);

  return NextResponse.json({ id, runId });
}
