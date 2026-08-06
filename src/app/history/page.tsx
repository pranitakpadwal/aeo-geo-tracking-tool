import Link from "next/link";
import { listScans } from "@/lib/scans";

export default function HistoryPage() {
  const scans = listScans();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Scan history</h1>
      {scans.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No scans yet. <Link href="/">Run your first scan</Link>.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {scans.map((s) => (
            <Link
              key={s.id}
              href={`/scan/${s.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 16px",
                background: "var(--bg-elevated)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{s.brand}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {s.industry}
                  {s.domain ? ` · ${s.domain}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13 }}>
                <div
                  style={{
                    color:
                      s.status === "complete"
                        ? "var(--good)"
                        : s.status === "error"
                          ? "var(--danger)"
                          : "var(--warn)",
                  }}
                >
                  {s.status}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  {new Date(s.createdAt).toLocaleString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
