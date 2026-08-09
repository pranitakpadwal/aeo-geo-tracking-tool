import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUniverseOwner, setAutoRunEnabled } from "@/lib/universe";

/** Toggles weekly auto-run. Auto-run only ever scans tracked themes (see
 * lib/universe.ts listUniversesDueForAutoRun / the instrumentation-driven
 * scheduler) — turning this on with nothing tracked yet is a no-op until
 * the user tracks at least one theme. */
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

  let body: { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  setAutoRunEnabled(id, Boolean(body.enabled));
  return NextResponse.json({ ok: true });
}
