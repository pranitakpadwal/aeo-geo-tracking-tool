import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUniverse, getUniverseOwner, setTrackedThemes } from "@/lib/universe";

/**
 * Sets which themes are opted in to be scanned (both "next manual run" and
 * "weekly auto-run" read this same list) and immediately recomputes the
 * top-N-by-volume tracked keyword set within them. Returns the refreshed
 * universe so the client can update the overview without a second fetch.
 */
export async function POST(
  req: NextRequest,
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

  let body: { themes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const themes = Array.isArray(body.themes) ? body.themes.map((t) => String(t)) : [];
  setTrackedThemes(id, themes);

  return NextResponse.json(getUniverse(id));
}
