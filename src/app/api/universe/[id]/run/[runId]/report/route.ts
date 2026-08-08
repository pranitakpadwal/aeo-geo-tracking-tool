import { NextRequest, NextResponse } from "next/server";
import { getBulkScan } from "@/lib/bulk-scan";
import { buildReportForUniverseRun } from "@/lib/report";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id, runId } = await params;
  const scan = getBulkScan(runId);
  if (!scan || scan.universeId !== id) {
    return NextResponse.json({ error: "Run not found for this universe." }, { status: 404 });
  }
  if (scan.status !== "complete") {
    return NextResponse.json({ error: `Run is ${scan.status}, not complete yet.` }, { status: 409 });
  }
  const report = buildReportForUniverseRun(id, runId);
  return NextResponse.json(report);
}
