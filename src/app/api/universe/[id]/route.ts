import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUniverse, getUniverseOwner } from "@/lib/universe";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const owner = getUniverseOwner(id);
  if (!owner.exists) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }
  // null owner = predates accounts, grandfathered as viewable by anyone.
  // Otherwise only the owner can see it — a universe can hold private
  // brand-strategy data (unpublished topic lists, competitor comparisons).
  if (owner.userId) {
    const user = await getCurrentUser();
    if (!user || user.id !== owner.userId) {
      return NextResponse.json({ error: "Universe not found." }, { status: 404 });
    }
  }

  const universe = getUniverse(id);
  return NextResponse.json(universe);
}
