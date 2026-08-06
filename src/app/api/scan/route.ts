import { NextRequest, NextResponse } from "next/server";
import { isConfigured } from "@/lib/anthropic";
import { createScan, runScan } from "@/lib/scans";
import type { ScanInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this server." },
      { status: 503 }
    );
  }

  let body: Partial<ScanInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const brand = (body.brand || "").trim();
  const industry = (body.industry || "").trim();
  if (!brand || !industry) {
    return NextResponse.json(
      { error: "brand and industry are required." },
      { status: 400 }
    );
  }

  const input: ScanInput = {
    brand,
    domain: (body.domain || "").trim() || undefined,
    industry,
    competitors: Array.isArray(body.competitors)
      ? body.competitors.map((c) => String(c).trim()).filter(Boolean).slice(0, 8)
      : [],
    customPrompts: Array.isArray(body.customPrompts)
      ? body.customPrompts.map((p) => String(p).trim()).filter(Boolean).slice(0, 10)
      : [],
  };

  const id = createScan(input);

  // Run inline and return once complete — scans are a handful of sequential
  // LLM calls, well within a typical request timeout. Errors are recorded on
  // the scan row rather than thrown, so the client can still fetch and see
  // partial state.
  try {
    await runScan(id, input);
  } catch {
    // status/error already persisted by runScan
  }

  return NextResponse.json({ id });
}
