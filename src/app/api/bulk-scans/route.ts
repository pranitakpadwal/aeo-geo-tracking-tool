import { NextResponse } from "next/server";
import { listBulkScans } from "@/lib/bulk-scan";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in to see your bulk scans." }, { status: 401 });
  }
  return NextResponse.json(listBulkScans(user.id));
}
