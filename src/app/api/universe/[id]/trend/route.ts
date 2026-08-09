import { NextRequest, NextResponse } from "next/server";
import { buildTrendForUniverse } from "@/lib/report";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner } from "@/lib/universe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  return NextResponse.json(buildTrendForUniverse(id));
}
