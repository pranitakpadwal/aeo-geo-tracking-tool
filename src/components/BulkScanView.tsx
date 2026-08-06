"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BulkTopicRow from "./BulkTopicRow";
import type { BulkScanDetail } from "@/lib/types";
import type { BulkScanReport } from "@/lib/report";

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: "var(--text-muted)" }}>±0</span>;
  const up = value > 0;
  return (
    <span style={{ color: up ? "var(--good)" : "var(--danger)" }}>
      {up ? "▲" : "▼"} {Math.abs(value)}pt
    </span>
  );
}

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
  // scan.topics and report.topics are built from the same ordered list, so
  // zipping by index pairs each raw result with its computed leader/tier row.
  const zipped = scan.topics.map((t, i) => ({ result: t, leader: report?.topics[i]?.leader ?? null }));
  const filteredRows = zipped.filter(({ result }) => tierFilter === "all" || result.priorityTier === tierFilter);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
      <Link href="/bulk-scan" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
        ← New bulk scan
      </Link>
      <h1 style={{ fontSize: 28, margin: "8px 0 4px" }}>{scan.brand}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
        {scan.domain} vs {competitorNames.join(", ") || "no competitors listed"} ·{" "}
        {new Date(scan.createdAt).toLocaleString()}
      </p>

      {scan.status !== "complete" && scan.status !== "error" && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            Running — {scan.completedTopics} / {scan.totalTopics} topics ({pct}%)
          </div>
          <Bar pct={pct} color="var(--accent)" />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            This page updates automatically every few seconds. Safe to leave open or come back later.
          </p>
        </div>
      )}

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

      {report && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Site-level: mentions vs. real citations</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "6px 8px" }}>Brand</th>
                    <th style={{ padding: "6px 8px" }}>Mention rate</th>
                    <th style={{ padding: "6px 8px" }}>Citation rate</th>
                    <th style={{ padding: "6px 8px" }}>Distinct cited URLs</th>
                    <th style={{ padding: "6px 8px" }}>Share of citations</th>
                    {report.movement && <th style={{ padding: "6px 8px" }}>vs. last run</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.site.brands.map((b) => (
                    <tr key={b.name} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px", fontWeight: b.isBrand ? 700 : 400 }}>
                        {b.name}
                        {b.isBrand ? " (you)" : ""}
                      </td>
                      <td style={{ padding: "8px", minWidth: 140 }}>
                        <div style={{ marginBottom: 4 }}>
                          {b.mentions}/{b.promptsTotal} ({b.mentionRate}%)
                        </div>
                        <Bar pct={b.mentionRate} color="#5a6472" />
                      </td>
                      <td style={{ padding: "8px", minWidth: 140 }}>
                        <div style={{ marginBottom: 4 }}>
                          {b.citations}/{b.promptsTotal} ({b.citationRate}%)
                        </div>
                        <Bar pct={b.citationRate} color={b.isBrand ? "var(--accent)" : "#5a6472"} />
                      </td>
                      <td style={{ padding: "8px" }}>{b.distinctCitedUrls.length}</td>
                      <td style={{ padding: "8px" }}>{report.site.shareOfCitations[b.name]}%</td>
                      {report.movement && (
                        <td style={{ padding: "8px" }}>
                          <Delta value={report.movement.brandDeltas[b.name]?.citationRateDelta ?? 0} /> citation rate
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.movement && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                Compared against the previous run on{" "}
                {new Date(report.movement.previousCreatedAt).toLocaleDateString()}.
              </p>
            )}
          </section>

          <section style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16 }}>Topic-level breakdown</h2>
              {tiers.length > 0 && (
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 13,
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
                fontSize: 12,
                color: "var(--text-muted)",
                padding: "0 8px 8px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span>Topic</span>
              <span>Tier</span>
              <span>Volume</span>
              <span>Who&rsquo;s cited (leader: {"→"})</span>
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
          </section>

          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Filled dot = cited (a real URL on that domain showed up as a source). Amber dot = mentioned by name
            but no URL cited. Legend applies above too.
          </p>
        </>
      )}

      {!report && scan.status === "running" && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Results will appear here once every topic has a real, checkable citation — not before, so the
          report never shows a partial/misleading picture mid-run.
        </div>
      )}
    </div>
  );
}
