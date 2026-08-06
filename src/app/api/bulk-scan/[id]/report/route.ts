import { NextRequest, NextResponse } from "next/server";
import { getBulkScan } from "@/lib/bulk-scan";
import { buildReportForScan } from "@/lib/report";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scan = getBulkScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Bulk scan not found." }, { status: 404 });
  }
  if (scan.status !== "complete") {
    return NextResponse.json({ error: `Scan is ${scan.status}, not complete yet.` }, { status: 409 });
  }
  const report = buildReportForScan(id);
  return NextResponse.json(report);
}
