import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUniverses } from "@/lib/universe";

export default async function UniverseListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const universes = listUniverses(user.id);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>My universes</h1>
        <Link
          href="/universe/new"
          style={{
            background: "var(--accent)",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          + New universe
        </Link>
      </div>

      {universes.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No universes yet. <Link href="/universe/new" style={{ color: "var(--accent)" }}>Create your first one</Link> —
          set the brand, competitors, and topic list once, then re-run it any time.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {universes.map((u) => (
            <Link
              key={u.id}
              href={`/universe/${u.id}`}
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
                <div style={{ fontWeight: 700 }}>
                  <span style={{ color: "var(--accent)" }}>{u.name.toUpperCase()}</span> — {u.brand}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {u.domain} vs {u.competitors.map((c) => c.name).join(", ") || "no competitors listed"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Created {new Date(u.createdAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
