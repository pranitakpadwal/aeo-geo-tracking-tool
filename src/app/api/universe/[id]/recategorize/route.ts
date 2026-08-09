import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner, runCategorization } from "@/lib/universe";

/**
 * Re-runs categorization. runCategorization() only ever touches rows with
 * a NULL category, so this is a safe, cheap "just the leftovers" retry —
 * not a full re-classify of the whole universe — and reuses the
 * already-proposed theme list (theme_list on universes) rather than
 * inventing a new one.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in to edit this universe." }, { status: 401 });
  }

  const { id } = await params;
  const owner = getUniverseOwner(id);
  if (!owner.exists) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }
  if (owner.userId && owner.userId !== user.id) {
    return NextResponse.json({ error: "Universe not found." }, { status: 404 });
  }

  runCategorization(id).catch((err) => {
    console.error(`Recategorization for universe ${id} failed:`, err);
  });

  return NextResponse.json({ ok: true });
}
