import { NextRequest, NextResponse } from "next/server";
import { getUniverse } from "@/lib/universe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const universe = getUniverse(id);
  if (!universe) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }
  return NextResponse.json(universe);
}
