import { NextResponse } from "next/server";
import { listScans } from "@/lib/scans";

export async function GET() {
  return NextResponse.json(listScans());
}
