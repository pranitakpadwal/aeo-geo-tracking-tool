"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BulkTopicRow from "./BulkTopicRow";
import { Bar, BarChart, Delta, PieChart, brandColor, statusFor, statusStyle } from "./Charts";
import type { BulkScanDetail } from "@/lib/types";
import type { BulkScanReport } from "@/lib/report";

export default function BulkScanView({ id }: { id: string }) {
  const [scan, setScan] = useState<BulkScanDetail | null>(null);
  const [report, setReport] = useState<BulkScanReport | null>(null);
  const [tierFilter, setTierFilter] = useState<string | "all">("all");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/bulk-scan/${id}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data: BulkScanDetail = await res.json();
      if (cancelled) return;
      setScan(data);

      if (data.status === "complete") {
        const rRes = await fetch(`/api/bulk-scan/${id}/report`, { cache: "no-store" });
        if (rRes.ok && !cancelled) setReport(await rRes.json());
      } else if (data.status !== "error") {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (!scan) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  const pct = scan.totalTopics ? Math.round((scan.completedTopics / scan.totalTopics) * 100) : 0;
  const competitorNames = scan.competitors.map((c) => c.name);
  const tiers = Array.from(new Set(scan.topics.map((t) => t.priorityTier).filter(Boolean))) as string[];
  const zipped = scan.topics.map((t, i) => ({ result: t, leader: report?.topics[i]?.leader ?? null }));
  const filteredRows = zipped.filter(({ result }) => tierFilter === "all" || result.priorityTier === tierFilter);

  return (
    <div style={{ maxWidth: 900, margin: "28px auto 60px", padding: "0 16px" }}>
      <div
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 30px rgba(0,0,0,0.08)",
          padding: "44px 42px 50px",
        }}
      >
        <Link href="/bulk-scan" style={{ fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none" }}>
          ← New bulk scan
        </Link>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10, marginBottom: 2 }}>
          <span style={{ fontWeight: 800, color: "var(--accent)", fontSize: 18, letterSpacing: "0.02em" }}>
            {scan.brand.toUpperCase()}
          </span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>AI Visibility — Bulk Citation Report</span>
        </div>
        <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 24px" }}>
          {scan.domain} vs {competitorNames.join(", ") || "no competitors listed"} · {scan.totalTopics} tracked
          topics · {new Date(scan.createdAt).toLocaleDateString()}
        </p>

        {scan.status !== "complete" && scan.status !== "error" && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Running — {scan.completedTopics} / {scan.totalTopics} topics ({pct}%)
            </div>
            <Bar pct={pct} color="var(--accent)" />
            <p style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)", marginTop: 8 }}>
              This page updates automatically every few seconds. Safe to leave open or come back later.
            </p>
          </div>
        )}

        {scan.status === "error" && (
          <div
            style={{
              border: "1px solid var(--danger)",
              background: "var(--danger-bg)",
              color: "var(--danger)",
              padding: "12px 14px",
              marginBottom: 24,
              fontSize: 13,
            }}
          >
            Scan failed: {scan.error}
          </div>
        )}

        {report && (
          <>
            <h1
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: "34px 0 4px",
                paddingBottom: 8,
                borderBottom: "3px solid var(--accent)",
              }}
            >
              0. Market Share Snapshot
            </h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Mentions is a share question — shown as a pie. Citations (real cited URLs) is a magnitude/business-
              value question, not a share of a fixed pie — shown as raw scale.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
                  Mention share
                </div>
                <PieChart
                  data={report.site.brands.map((b) => ({
                    label: b.name,
                    value: Math.max(b.mentions, 0.0001),
                    color: brandColor(b.name, report!.site.brands),
                  }))}
                />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
                  Distinct cited URLs (scale, not share)
                </div>
                <BarChart
                  data={report.site.brands.map((b) => ({
                    label: b.name,
                    value: b.distinctCitedUrls.length,
                    color: brandColor(b.name, report!.site.brands),
                  }))}
                />
              </div>
            </div>

            <h1
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: "34px 0 4px",
                paddingBottom: 8,
                borderBottom: "3px solid var(--accent)",
              }}
            >
              1. Site-Level Scorecard
            </h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Visibility score is one number to rank brands by: mention rate × 0.4 + citation rate × 0.6 — citation
              (a real cited URL) counts for more since it&rsquo;s the harder, more business-relevant signal.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 6 }}>
                <thead>
                  <tr>
                    {["Brand", "Visibility score", "Mention rate", "Citation rate", "Distinct URLs", "Share of citations", "Status"]
                      .concat(report.movement ? ["vs. last run"] : [])
                      .map((h) => (
                        <th
                          key={h}
                          style={{
                            background: "var(--table-head)",
                            color: "#fff",
                            textAlign: "left",
                            padding: "7px 10px",
                            border: "1px solid var(--table-head)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {report.site.brands.map((b) => {
                    const others = report!.site.brands.filter((o) => o.name !== b.name).map((o) => o.citationRate);
                    const maxOther = others.length ? Math.max(...others) : 0;
                    const status = statusFor(b.citationRate, maxOther, b.citations > 0);
                    const sty = statusStyle[status];
                    return (
                      <tr key={b.name} style={{ background: sty.bg }}>
                        <td style={{ padding: "7px 10px", border: "1px solid var(--border)", fontWeight: 700 }}>
                          {b.name}
                          {b.isBrand ? " (you)" : ""}
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)", fontWeight: 700 }}>
                          {b.visibilityScore}
                        </td>
                        <td style={{ padding: "7px 10px", border: "1px solid var(--border)", minWidth: 130 }}>
                          <div className="mono" style={{ marginBottom: 4 }}>
                            {b.mentions}/{b.promptsTotal} ({b.mentionRate}%)
                          </div>
                          <Bar pct={b.mentionRate} color="var(--text-faint)" />
                        </td>
                        <td style={{ padding: "7px 10px", border: "1px solid var(--border)", minWidth: 130 }}>
                          <div className="mono" style={{ marginBottom: 4 }}>
                            {b.citations}/{b.promptsTotal} ({b.citationRate}%)
                          </div>
                          <Bar pct={b.citationRate} color={brandColor(b.name, report!.site.brands)} />
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)" }}>
                          {b.distinctCitedUrls.length}
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)" }}>
                          {report!.site.shareOfCitations[b.name]}%
                        </td>
                        <td style={{ padding: "7px 10px", border: "1px solid var(--border)", color: sty.text, fontWeight: 700 }}>
                          {sty.label}
                        </td>
                        {report!.movement && (
                          <td className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)" }}>
                            <Delta value={report!.movement.brandDeltas[b.name]?.citationRateDelta ?? 0} /> citation rate
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {report.movement && (
              <p style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)", marginBottom: 0 }}>
                Compared against the previous run on {new Date(report.movement.previousCreatedAt).toLocaleDateString()}.
              </p>
            )}

            <h1
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: "34px 0 4px",
                paddingBottom: 8,
                borderBottom: "3px solid var(--accent)",
              }}
            >
              2. Theme Breakdown
            </h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Your topics, grouped into themes. If you didn&rsquo;t supply a category on upload, Claude auto-grouped
              them from the topics themselves — nothing to hand-label.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 24 }}>
                <thead>
                  <tr>
                    {["Theme", "Topics", "Leader"].concat(report.site.brands.map((b) => `${b.name} — score (mentions / citations)`)).map((h) => (
                      <th
                        key={h}
                        style={{
                          background: "var(--table-head)",
                          color: "#fff",
                          textAlign: "left",
                          padding: "7px 10px",
                          border: "1px solid var(--table-head)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.themes.map((t) => (
                    <tr key={t.theme}>
                      <td style={{ padding: "7px 10px", border: "1px solid var(--border)", fontWeight: 700 }}>{t.theme}</td>
                      <td className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)" }}>
                        {t.topicsCount}
                      </td>
                      <td style={{ padding: "7px 10px", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                        {t.leader || "—"}
                      </td>
                      {report.site.brands.map((b) => (
                        <td key={b.name} className="mono" style={{ padding: "7px 10px", border: "1px solid var(--border)" }}>
                          <strong>{t.perBrand[b.name]?.visibilityScore ?? 0}</strong> ({t.perBrand[b.name]?.mentions ?? 0} /{" "}
                          {t.perBrand[b.name]?.citations ?? 0})
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h1
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: "34px 0 4px",
                paddingBottom: 8,
                borderBottom: "3px solid var(--accent)",
              }}
            >
              3. Topic-Level Breakdown
            </h1>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              {tiers.length > 0 && (
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    padding: "6px 10px",
                    fontSize: 12.5,
                    fontFamily: "inherit",
                  }}
                >
                  <option value="all">All tiers</option>
                  {tiers.sort().map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 0.6fr 0.7fr 1.2fr auto",
                gap: 10,
                fontSize: 10.5,
                fontWeight: 700,
                color: "#fff",
                background: "var(--table-head)",
                padding: "8px 10px",
              }}
            >
              <span>Topic</span>
              <span>Tier</span>
              <span>Volume</span>
              <span>Who&rsquo;s cited</span>
              <span></span>
            </div>
            {filteredRows.map(({ result, leader }) => (
              <BulkTopicRow
                key={result.id}
                result={result}
                brandName={scan.brand}
                competitorNames={competitorNames}
                leader={leader}
              />
            ))}

            <p style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)", marginTop: 12 }}>
              Filled dot = cited (a real URL on that domain showed up as a source). Amber dot = mentioned by name
              but no URL cited.
            </p>
          </>
        )}

        {!report && scan.status === "running" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Results will appear here once every topic has a real, checkable citation — not before, so the report
            never shows a partial/misleading picture mid-run.
          </div>
        )}
      </div>
    </div>
  );
}
