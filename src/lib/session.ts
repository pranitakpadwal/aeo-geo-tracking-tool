import { cookies } from "next/headers";
import { getUserForSession, SESSION_COOKIE, type AuthUser } from "./auth";

/** Server-only: reads the session cookie for the current request (Server
 * Component, Route Handler, or Server Action) and resolves it to a user.
 * `cookies()` is async in this Next.js version — must be awaited. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return getUserForSession(store.get(SESSION_COOKIE)?.value);
}
