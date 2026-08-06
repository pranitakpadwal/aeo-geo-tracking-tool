import Link from "next/link";
import { notFound } from "next/navigation";
import PromptCard from "@/components/PromptCard";
import { getScan, listScansForBrand } from "@/lib/scans";

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) notFound();

  const total = scan.results.length;
  const brandCites = scan.results.filter((r) => r.brandMentioned).length;
  const brandRate = pct(brandCites, total);

  const competitorTotals = new Map<string, number>();
  for (const r of scan.results) {
    for (const [name, mentioned] of Object.entries(r.competitorsMentioned)) {
      if (mentioned) competitorTotals.set(name, (competitorTotals.get(name) || 0) + 1);
    }
  }
  const shareOfVoice = [
    { name: scan.brand, count: brandCites, isBrand: true },
    ...Array.from(competitorTotals.entries()).map(([name, count]) => ({
      name,
      count,
      isBrand: false,
    })),
  ].sort((a, b) => b.count - a.count);

  const history =
    scan.status === "complete" ? listScansForBrand(scan.brand, scan.domain) : [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← New scan
        </Link>
      </div>
      <h1 style={{ fontSize: 28, margin: "8px 0 4px" }}>{scan.brand}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        {scan.industry}
        {scan.domain ? ` · ${scan.domain}` : ""} · scanned{" "}
        {new Date(scan.createdAt).toLocaleString()}
      </p>

      {scan.status === "error" && (
        <div
          style={{
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 24,
          }}
        >
          Scan failed: {scan.error}
        </div>
      )}

      {total > 0 && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 20,
                background: "var(--bg-elevated)",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                Citation rate
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)" }}>
                {brandRate}%
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {scan.brand} was named in {brandCites} of {total} simulated AI answers
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 20,
                background: "var(--bg-elevated)",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                Site AEO readiness
              </div>
              {scan.siteAudit ? (
                <>
                  <div style={{ fontSize: 36, fontWeight: 700 }}>{scan.siteAudit.score}
                    <span style={{ fontSize: 18, color: "var(--text-muted)" }}>/100</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {scan.siteAudit.checks.filter((c) => c.passed).length} of{" "}
                    {scan.siteAudit.checks.length} checks passed
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Add a website to get a readiness audit.
                </div>
              )}
            </div>
          </section>

          {shareOfVoice.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 14 }}>Share of voice</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {shareOfVoice.map((row) => (
                  <div key={row.name} style={{ display: "grid", gap: 4 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: row.isBrand ? 700 : 400 }}>
                        {row.name}
                        {row.isBrand ? " (you)" : ""}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {row.count}/{total}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct(row.count, total)}%`,
                          background: row.isBrand ? "var(--accent)" : "#5a6472",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {scan.siteAudit && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 14 }}>Readiness checklist</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {scan.siteAudit.checks.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <span style={{ color: c.passed ? "var(--good)" : "var(--warn)" }}>
                      {c.passed ? "✓" : "!"}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.label}</div>
                      <div style={{ color: "var(--text-muted)" }}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {history.length > 1 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, marginBottom: 14 }}>Trend over time</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
                {history.map((h) => {
                  const detail = h.id === scan.id ? scan : getScan(h.id);
                  const t = detail?.results.length ?? 0;
                  const c = detail?.results.filter((r) => r.brandMentioned).length ?? 0;
                  const rate = pct(c, t);
                  return (
                    <div
                      key={h.id}
                      title={`${new Date(h.createdAt).toLocaleDateString()}: ${rate}%`}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rate}%</div>
                      <div
                        style={{
                          width: "100%",
                          height: Math.max(4, rate * 0.5),
                          background: h.id === scan.id ? "var(--accent)" : "#3a4451",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Prompts &amp; simulated answers</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {scan.results.map((r) => (
                <PromptCard key={r.promptId} result={r} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
