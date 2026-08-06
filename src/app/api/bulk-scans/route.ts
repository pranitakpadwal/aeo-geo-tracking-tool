import { NextResponse } from "next/server";
import { listBulkScans } from "@/lib/bulk-scan";

export async function GET() {
  return NextResponse.json(listBulkScans());
}
