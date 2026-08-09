import type { Metadata } from "next";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { isPersistentStorage } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citable — AEO/GEO Tracking",
  description:
    "Track whether AI answer engines (ChatGPT, Perplexity, Google AI Overviews) cite your brand — and what's working for the competitors who get cited instead.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const persistent = isPersistentStorage();

  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          {!persistent && (
            <div
              style={{
                background: "#7a1f1f",
                color: "#fff",
                padding: "10px 24px",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              ⚠️ No persistent database configured on this server — every account, universe, and
              run will be deleted on the next deploy. Set DATABASE_PATH to a file on a mounted
              Volume before putting real data in. See README &ldquo;Deploying&rdquo;.
            </div>
          )}
          <header
            style={{
              background: "var(--bg-elevated)",
              borderBottom: "3px solid var(--accent)",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Link
              href="/"
              style={{
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: "0.02em",
                textDecoration: "none",
                color: "var(--accent)",
              }}
            >
              CITABLE
            </Link>
            <nav style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 13.5 }}>
              <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                New scan
              </Link>
              <Link href="/universe" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                My Universes
              </Link>
              <Link href="/bulk-scan" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                Bulk scan
              </Link>
              <Link href="/history" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                History
              </Link>
              <span style={{ width: 1, height: 16, background: "var(--border)" }} />
              {user ? (
                <>
                  <span style={{ color: "var(--text-muted)" }}>{user.email}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      textDecoration: "none",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontWeight: 700,
                    }}
                  >
                    Register
                  </Link>
                </>
              )}
            </nav>
          </header>
          <main style={{ flex: 1, background: "var(--bg)" }}>{children}</main>
          <footer
            style={{
              background: "var(--bg-elevated)",
              borderTop: "1px solid var(--border)",
              padding: "16px 24px",
              fontSize: 11.5,
              fontStyle: "italic",
              color: "var(--text-muted)",
            }}
          >
            Citable scans by asking Claude to answer real customer questions the way an AI
            assistant would, then checking whether your brand — or your competitors — show up in
            the answer. Not affiliated with OpenAI, Perplexity, or Google.
          </footer>
        </div>
      </body>
    </html>
  );
}
