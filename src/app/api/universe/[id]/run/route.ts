import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner, startUniverseRun } from "@/lib/universe";
import type { PromptMode } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in to run this universe." }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this server." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const owner = getUniverseOwner(id);
  if (!owner.exists) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }
  if (owner.userId && owner.userId !== user.id) {
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
  let runId: string;
  try {
    runId = startUniverseRun(id, promptMode, owner.userId ?? user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start run." },
      { status: 400 }
    );
  }

  return NextResponse.json({ runId });
}
