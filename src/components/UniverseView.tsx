"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Delta, PieChart, brandColor, statusFor, statusStyle } from "./Charts";
import type { BulkScanDetail, PromptMode, UniverseDetail } from "@/lib/types";
import type { UniverseRunReport } from "@/lib/report";

const pageBadge: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "var(--good-bg)", text: "var(--good)", label: "New" },
  continuing: { bg: "var(--bg-alt)", text: "var(--text-muted)", label: "Continuing" },
  lost: { bg: "var(--danger-bg)", text: "var(--danger)", label: "Lost" },
};

const sectionHeading: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: "34px 0 4px",
  paddingBottom: 8,
  borderBottom: "3px solid var(--accent)",
};

const th: React.CSSProperties = {
  background: "var(--table-head)",
  color: "#fff",
  textAlign: "left",
  padding: "7px 10px",
  border: "1px solid var(--table-head)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = { padding: "7px 10px", border: "1px solid var(--border)" };

export default function UniverseView({ id }: { id: string }) {
  const [universe, setUniverse] = useState<UniverseDetail | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<BulkScanDetail | null>(null);
  const [report, setReport] = useState<UniverseRunReport | null>(null);
  const [starting, setStarting] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>("question");

  const loadUniverse = useCallback(async () => {
    const res = await fetch(`/api/universe/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: UniverseDetail = await res.json();
    setUniverse(data);
    return data;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await loadUniverse();
      if (!cancelled && data?.latestRunId) setRunId(data.latestRunId);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadUniverse]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/bulk-scan/${runId}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data: BulkScanDetail = await res.json();
      if (cancelled) return;
      setRun(data);

      if (data.status === "complete") {
        const rRes = await fetch(`/api/universe/${id}/run/${runId}/report`, { cache: "no-store" });
        if (rRes.ok && !cancelled) setReport(await rRes.json());
        loadUniverse();
      } else if (data.status !== "error") {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, runId, loadUniverse]);

  async function runNow() {
    setStarting(true);
    setReport(null);
    setRun(null);
    try {
      const res = await fetch(`/api/universe/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptMode }),
      });
      const data = await res.json();
      if (res.ok) setRunId(data.runId);
    } finally {
      setStarting(false);
    }
  }

  if (!universe) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  const competitorNames = universe.competitors.map((c) => c.name);
  const pct = run && run.totalTopics ? Math.round((run.completedTopics / run.totalTopics) * 100) : 0;
  const isRunning = run && run.status !== "complete" && run.status !== "error";
  const runs = universe.runs;

  return (
    <div style={{ maxWidth: 900, margin: "28px auto 60px", padding: "0 16px" }}>
      <div
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 30px rgba(0,0,0,0.08)",
          padding: "44px 42px 50px",
        }}
      >
        <Link href="/universe/new" style={{ fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none" }}>
          ← New universe
        </Link>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10, marginBottom: 2 }}>
          <span style={{ fontWeight: 800, color: "var(--accent)", fontSize: 18, letterSpacing: "0.02em" }}>
            {universe.name.toUpperCase()}
          </span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Universe — {universe.brand}</span>
        </div>
        <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 4px" }}>
          {universe.domain} vs {competitorNames.join(", ") || "no competitors listed"} · {universe.topicCount}{" "}
          tracked topics · {runs.length} run{runs.length === 1 ? "" : "s"} so far
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "0 0 20px" }}>
          Created {new Date(universe.createdAt).toLocaleDateString()}
        </p>

        <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 12.5 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="promptMode"
              checked={promptMode === "question"}
              onChange={() => setPromptMode("question")}
            />
            Rewrite into shopper questions (recommended)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="promptMode"
              checked={promptMode === "keyword"}
              onChange={() => setPromptMode("keyword")}
            />
            Use keywords as-is
          </label>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Applies to the next run — compare this run&rsquo;s visibility/mentions/citations/cited pages against a
          previous run made with the other mode.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button
            onClick={runNow}
            disabled={starting || Boolean(isRunning)}
            style={{
              background: starting || isRunning ? "var(--border)" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 700,
              cursor: starting || isRunning ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {isRunning ? "Running…" : starting ? "Starting…" : "Run now"}
          </button>
          {!run && !isRunning && (
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              No run loaded yet — hit &ldquo;Run now&rdquo; to check this universe.
            </span>
          )}
        </div>

        {isRunning && run && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Running — {run.completedTopics} / {run.totalTopics} topics ({pct}%)
            </div>
            <Bar pct={pct} color="var(--accent)" />
            <p style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)", marginTop: 8 }}>
              This page updates automatically every few seconds. Safe to leave open or come back later.
            </p>
          </div>
        )}

        {run?.status === "error" && (
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
            Run failed: {run.error}
          </div>
        )}

        {runs.length > 1 && (
          <>
            <h1 style={sectionHeading}>Run history</h1>
            <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
              {runs
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px 130px", gap: 10, alignItems: "center", fontSize: 12 }}>
                    <span className="mono" style={{ color: "var(--text-muted)" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    <Bar pct={r.status === "complete" ? 100 : r.status === "error" ? 0 : 50} color={r.id === runId ? "var(--accent)" : "var(--series-3)"} />
                    <span style={{ color: r.status === "error" ? "var(--danger)" : "var(--text-muted)" }}>{r.status}</span>
                    <span style={{ color: "var(--text-faint)" }}>
                      {r.promptMode === "keyword" ? "keyword prompts" : "question prompts"}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {report && run && (
          <>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 4px" }}>
              This run used{" "}
              <strong>{run.promptMode === "keyword" ? "keywords as-is" : "rewritten shopper questions"}</strong>{" "}
              as the prompt sent to Claude.
            </p>
            <h1 style={{ ...sectionHeading, marginTop: 10 }}>0. Market Share Snapshot</h1>
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
                    color: brandColor(b.name, report.site.brands),
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
                    color: brandColor(b.name, report.site.brands),
                  }))}
                />
              </div>
            </div>

            <h1 style={sectionHeading}>1. Site-Level Scorecard</h1>
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
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {report.site.brands.map((b) => {
                    const others = report.site.brands.filter((o) => o.name !== b.name).map((o) => o.citationRate);
                    const maxOther = others.length ? Math.max(...others) : 0;
                    const status = statusFor(b.citationRate, maxOther, b.citations > 0);
                    const sty = statusStyle[status];
                    return (
                      <tr key={b.name} style={{ background: sty.bg }}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          {b.name}
                          {b.isBrand ? " (you)" : ""}
                        </td>
                        <td className="mono" style={{ ...td, fontWeight: 700 }}>
                          {b.visibilityScore}
                        </td>
                        <td style={{ ...td, minWidth: 130 }}>
                          <div className="mono" style={{ marginBottom: 4 }}>
                            {b.mentions}/{b.promptsTotal} ({b.mentionRate}%)
                          </div>
                          <Bar pct={b.mentionRate} color="var(--text-faint)" />
                        </td>
                        <td style={{ ...td, minWidth: 130 }}>
                          <div className="mono" style={{ marginBottom: 4 }}>
                            {b.citations}/{b.promptsTotal} ({b.citationRate}%)
                          </div>
                          <Bar pct={b.citationRate} color={brandColor(b.name, report.site.brands)} />
                        </td>
                        <td className="mono" style={td}>
                          {b.distinctCitedUrls.length}
                        </td>
                        <td className="mono" style={td}>
                          {report.site.shareOfCitations[b.name]}%
                        </td>
                        <td style={{ ...td, color: sty.text, fontWeight: 700 }}>{sty.label}</td>
                        {report.movement && (
                          <td className="mono" style={td}>
                            <Delta value={report.movement.brandDeltas[b.name]?.citationRateDelta ?? 0} /> citation rate
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

            <h1 style={sectionHeading}>2. Theme Breakdown</h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Topics rolled up by sub-category (e.g. Skincare, Lips, Hair Care) within this universe. If no
              category was set on import, these themes were auto-grouped by Claude from the topics themselves —
              nothing to hand-label.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 6 }}>
                <thead>
                  <tr>
                    <th style={th}>Theme</th>
                    <th style={th}>Topics</th>
                    <th style={th}>Leader</th>
                    {report.site.brands.map((b) => (
                      <th key={b.name} style={th}>
                        {b.name} — score (mentions / citations)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.themes.map((t) => (
                    <tr key={t.theme}>
                      <td style={{ ...td, fontWeight: 700 }}>{t.theme}</td>
                      <td className="mono" style={td}>
                        {t.topicsCount}
                      </td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>{t.leader || "—"}</td>
                      {report.site.brands.map((b) => (
                        <td key={b.name} className="mono" style={td}>
                          <strong>{t.perBrand[b.name]?.visibilityScore ?? 0}</strong> ({t.perBrand[b.name]?.mentions ?? 0} /{" "}
                          {t.perBrand[b.name]?.citations ?? 0})
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h1 style={sectionHeading}>3. Cited Pages</h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Every distinct URL cited this run, per brand, ranked by how many topics cited it
              {report.citedPages.some((p) => p.status) ? " — with new/continuing/lost vs. the previous run." : "."}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 6 }}>
                <thead>
                  <tr>
                    <th style={th}>URL</th>
                    <th style={th}>Brand</th>
                    <th style={th}>Topics citing</th>
                    {report.citedPages.some((p) => p.status) && <th style={th}>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.citedPages.length === 0 && (
                    <tr>
                      <td style={td} colSpan={4}>
                        No cited URLs found in this run.
                      </td>
                    </tr>
                  )}
                  {report.citedPages.map((p) => {
                    const badge = p.status ? pageBadge[p.status] : null;
                    return (
                      <tr key={`${p.brand}:${p.url}`} style={badge ? { background: badge.bg } : undefined}>
                        <td style={td}>
                          <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                            {p.title || p.url}
                          </a>
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{p.brand}</td>
                        <td className="mono" style={td}>
                          {p.topicsCiting}
                        </td>
                        {report.citedPages.some((x) => x.status) && (
                          <td style={{ ...td, color: badge?.text, fontWeight: 700 }}>{badge?.label || "—"}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!report && run && !isRunning && run.status === "complete" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading report…</div>
        )}
      </div>
    </div>
  );
}
