import { NextRequest, NextResponse } from "next/server";
import { getBulkScan } from "@/lib/bulk-scan";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scan = getBulkScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Bulk scan not found." }, { status: 404 });
  }
  return NextResponse.json(scan);
}
