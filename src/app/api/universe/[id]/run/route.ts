import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { getUniverse, startUniverseRun } from "@/lib/universe";
import type { PromptMode } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this server." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const universe = getUniverse(id);
  if (!universe) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }

  // Optional { promptMode: "question" | "keyword" } body — defaults to
  // "question" (rewritten shopper questions) when omitted or invalid.
  let promptMode: PromptMode | undefined;
  try {
    const body = await req.json();
    if (body?.promptMode === "keyword" || body?.promptMode === "question") {
      promptMode = body.promptMode;
    }
  } catch {
    // no body sent — fine, default mode applies
  }

  // No topics/CSV in the request body — startUniverseRun rebuilds the run
  // input entirely from what's stored on the universe.
  const runId = startUniverseRun(id, promptMode);

  return NextResponse.json({ runId });
}
