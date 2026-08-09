import { NextRequest, NextResponse } from "next/server";
import { getBulkScan } from "@/lib/bulk-scan";
import { buildReportForUniverseRun } from "@/lib/report";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner } from "@/lib/universe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id, runId } = await params;

  const owner = getUniverseOwner(id);
  if (!owner.exists) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }
  if (owner.userId) {
    const user = await getCurrentUser();
    if (!user || user.id !== owner.userId) {
      return NextResponse.json({ error: "Universe not found." }, { status: 404 });
    }
  }

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
