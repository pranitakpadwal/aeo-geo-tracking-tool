import { NextRequest, NextResponse } from "next/server";
import { getBulkScan, getBulkScanOwner } from "@/lib/bulk-scan";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const owner = getBulkScanOwner(id);
  if (!owner.exists) {
    return NextResponse.json({ error: "Bulk scan not found." }, { status: 404 });
  }
  if (owner.userId) {
    const user = await getCurrentUser();
    if (!user || user.id !== owner.userId) {
      return NextResponse.json({ error: "Bulk scan not found." }, { status: 404 });
    }
  }

  const scan = getBulkScan(id);
  return NextResponse.json(scan);
}
