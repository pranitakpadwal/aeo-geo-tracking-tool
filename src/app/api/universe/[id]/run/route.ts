import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { getUniverse, startUniverseRun } from "@/lib/universe";

export async function POST(
  _req: NextRequest,
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

  // No topics/CSV in the request body — startUniverseRun rebuilds the run
  // input entirely from what's stored on the universe.
  const runId = startUniverseRun(id);

  return NextResponse.json({ runId });
}
