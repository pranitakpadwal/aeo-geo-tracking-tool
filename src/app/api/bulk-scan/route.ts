import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { createBulkScan, runBulkScan } from "@/lib/bulk-scan";
import type { BulkScanInput } from "@/lib/types";

const MAX_TOPICS = 500;

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this server." },
      { status: 503 }
    );
  }

  let body: Partial<BulkScanInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const brand = (body.brand || "").trim();
  const domain = (body.domain || "").trim();
  if (!brand) {
    return NextResponse.json({ error: "brand is required." }, { status: 400 });
  }
  if (!domain) {
    return NextResponse.json(
      { error: "domain is required for bulk scans — citation URLs are matched against it." },
      { status: 400 }
    );
  }

  const topics = Array.isArray(body.topics)
    ? body.topics
        .map((t) => ({
          topic: String(t.topic || "").trim(),
          type: t.type ? String(t.type).trim() : undefined,
          category: t.category ? String(t.category).trim() : undefined,
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

  const promptMode = body.promptMode === "keyword" ? "keyword" : "question";
  const input: BulkScanInput = { brand, domain, competitors, topics, promptMode };
  const id = createBulkScan(input);

  // Fire-and-forget: this process is expected to be a persistent Node server
  // (e.g. `next start` on Railway), not a serverless/edge function that dies
  // after the response — so this keeps running after we return the id. A
  // client polls GET /api/bulk-scan/[id] for progress.
  runBulkScan(id, input).catch((err) => {
    console.error(`Bulk scan ${id} failed:`, err);
  });

  return NextResponse.json({ id });
}
