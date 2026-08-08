import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citable — AEO/GEO Tracking",
  description:
    "Track whether AI answer engines (ChatGPT, Perplexity, Google AI Overviews) cite your brand — and what's working for the competitors who get cited instead.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
            <nav style={{ display: "flex", gap: 22, fontSize: 13.5 }}>
              <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                New scan
              </Link>
              <Link href="/universe/new" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                Universe
              </Link>
              <Link href="/bulk-scan" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                Bulk scan
              </Link>
              <Link href="/history" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                History
              </Link>
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
