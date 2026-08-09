"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Delta, LineChart, PieChart, SERIES_COLORS, brandColor, statusFor, statusStyle } from "./Charts";
import BulkTopicRow from "./BulkTopicRow";
import { buildSummary } from "@/lib/report-calc";
import type { BulkScanDetail, PromptMode, UniverseDetail } from "@/lib/types";
import type { TrendPoint, UniverseRunReport } from "@/lib/report";

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
  const [tierFilter, setTierFilter] = useState<string | "all">("all");
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [savingThemes, setSavingThemes] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [autoRunPending, setAutoRunPending] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const themesTouched = useRef(false);

  const loadUniverse = useCallback(async () => {
    const res = await fetch(`/api/universe/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: UniverseDetail = await res.json();
    setUniverse(data);
    if (!themesTouched.current) setSelectedThemes(new Set(data.trackedThemes));
    return data;
  }, [id]);

  const loadTrend = useCallback(async () => {
    const res = await fetch(`/api/universe/${id}/trend`, { cache: "no-store" });
    if (res.ok) setTrend(await res.json());
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await loadUniverse();
      if (!cancelled && data?.latestRunId) setRunId(data.latestRunId);
      if (!cancelled) loadTrend();
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadUniverse, loadTrend]);

  // Poll while categorization (the cheap pre-run classification pass) is
  // still working through a large upload.
  useEffect(() => {
    if (universe?.categorizationStatus !== "pending" && universe?.categorizationStatus !== "running") return;
    const timer = setTimeout(loadUniverse, 3000);
    return () => clearTimeout(timer);
  }, [universe?.categorizationStatus, loadUniverse]);

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
        loadTrend();
      } else if (data.status !== "error") {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, runId, loadUniverse, loadTrend]);

  async function runNow() {
    setStarting(true);
    setRunError(null);
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
      else setRunError(data.error || "Failed to start run.");
    } finally {
      setStarting(false);
    }
  }

  function toggleTheme(theme: string) {
    themesTouched.current = true;
    setSelectedThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) next.delete(theme);
      else next.add(theme);
      return next;
    });
  }

  async function saveTrackedThemes() {
    setSavingThemes(true);
    try {
      const res = await fetch(`/api/universe/${id}/tracked-themes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ themes: Array.from(selectedThemes) }),
      });
      if (res.ok) {
        themesTouched.current = false;
        setUniverse(await res.json());
      }
    } finally {
      setSavingThemes(false);
    }
  }

  async function toggleAutoRun() {
    if (!universe) return;
    setAutoRunPending(true);
    const next = !universe.autoRunEnabled;
    try {
      const res = await fetch(`/api/universe/${id}/auto-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setUniverse((u) => (u ? { ...u, autoRunEnabled: next } : u));
    } finally {
      setAutoRunPending(false);
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
  const summary = report ? buildSummary(report) : null;
  const tiers = run ? (Array.from(new Set(run.topics.map((t) => t.priorityTier).filter(Boolean))) as string[]) : [];
  const zipped =
    run && report
      ? run.topics.map((t, i) => ({ result: t, leader: report.topics[i]?.leader ?? null }))
      : [];
  const filteredTopicRows = zipped.filter(({ result }) => tierFilter === "all" || result.priorityTier === tierFilter);

  const isCategorizing = universe.categorizationStatus === "pending" || universe.categorizationStatus === "running";
  const trackedKeywordTotal = universe.themeSummary
    .filter((t) => selectedThemes.has(t.theme))
    .reduce((s, t) => s + Math.min(t.keywordCount, 20), 0);
  const themesChanged =
    selectedThemes.size !== universe.trackedThemes.length ||
    universe.trackedThemes.some((t) => !selectedThemes.has(t));

  const brandNames = [universe.brand, ...competitorNames];
  const trendSeries = brandNames.map((name, i) => ({
    label: name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    values: trend.map((p) => p.scores[name] ?? 0),
  }));

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
          {universe.domain} vs {competitorNames.join(", ") || "no competitors listed"} · {universe.topicCount.toLocaleString()}{" "}
          keywords uploaded · {universe.trackedTopicCount} tracked for scanning · {runs.length} run{runs.length === 1 ? "" : "s"} so far
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "0 0 20px" }}>
          Created {new Date(universe.createdAt).toLocaleDateString()}
        </p>

        {isCategorizing && (
          <div
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg-alt)",
              padding: "14px 16px",
              marginBottom: 24,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Categorizing {universe.topicCount.toLocaleString()} keywords…
            </div>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12.5 }}>
              Sorting every keyword into Brand vs. real sub-categories (Skincare, Hair Care, etc.) — no search cost
              yet, this is a cheap classification pass. This page checks back every few seconds; safe to leave open
              or come back later.
            </p>
          </div>
        )}

        {universe.categorizationStatus === "error" && (
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
            Categorization failed: {universe.categorizationError}
          </div>
        )}

        {!isCategorizing && universe.themeSummary.length > 0 && (
          <>
            <h1 style={sectionHeading}>Universe Overview</h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Every uploaded keyword, grouped into themes. Pick which themes to track — only the top 20
              highest-volume keywords per tracked theme actually get scanned, so cost stays flat no matter how
              many thousand keywords you uploaded. Untracked themes stay visible here but never get scanned.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th style={th}>Track</th>
                    <th style={th}>Theme</th>
                    <th style={th}>Keywords</th>
                    <th style={th}>Total volume</th>
                    <th style={th}>Will scan</th>
                  </tr>
                </thead>
                <tbody>
                  {universe.themeSummary.map((t) => (
                    <tr key={t.theme} style={selectedThemes.has(t.theme) ? { background: "var(--good-bg)" } : undefined}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selectedThemes.has(t.theme)}
                          onChange={() => toggleTheme(t.theme)}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{t.theme}</td>
                      <td className="mono" style={td}>
                        {t.keywordCount.toLocaleString()}
                      </td>
                      <td className="mono" style={td}>
                        {t.totalVolume.toLocaleString()}
                      </td>
                      <td className="mono" style={{ ...td, color: "var(--text-muted)" }}>
                        {selectedThemes.has(t.theme) ? Math.min(t.keywordCount, 20) : 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <button
                onClick={saveTrackedThemes}
                disabled={savingThemes || !themesChanged}
                style={{
                  background: !themesChanged ? "var(--border)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !themesChanged ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {savingThemes ? "Saving…" : "Save tracked themes"}
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {selectedThemes.size} theme{selectedThemes.size === 1 ? "" : "s"} tracked · up to{" "}
                {trackedKeywordTotal.toLocaleString()} keywords will be scanned per run
              </span>
            </div>
          </>
        )}

        {!isCategorizing && (
          <>
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
              Applies to the next run — compare this run&rsquo;s visibility/mentions/citations/cited pages against
              a previous run made with the other mode.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                onClick={runNow}
                disabled={starting || Boolean(isRunning) || universe.trackedTopicCount === 0}
                title={universe.trackedTopicCount === 0 ? "Track at least one theme above first" : undefined}
                style={{
                  background:
                    starting || isRunning || universe.trackedTopicCount === 0 ? "var(--border)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: starting || isRunning || universe.trackedTopicCount === 0 ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {isRunning
                  ? "Running…"
                  : starting
                    ? "Starting…"
                    : `Run now${universe.trackedTopicCount ? ` (${universe.trackedTopicCount} topics)` : ""}`}
              </button>
              {universe.trackedTopicCount === 0 && (
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Track at least one theme above before running.
                </span>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", marginLeft: "auto" }}>
                <input
                  type="checkbox"
                  checked={universe.autoRunEnabled}
                  disabled={autoRunPending}
                  onChange={toggleAutoRun}
                />
                Auto-run weekly (tracked themes only)
              </label>
            </div>
            {universe.autoRunEnabled && (
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 14px" }}>
                {universe.lastAutoRunAt
                  ? `Last auto-run ${new Date(universe.lastAutoRunAt).toLocaleDateString()} — next one due about a week after.`
                  : "Will run automatically about a week from now if you don't hit “Run now” first."}
              </p>
            )}
            {runError && (
              <div
                style={{
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  padding: "10px 12px",
                  marginBottom: 14,
                  fontSize: 13,
                }}
              >
                {runError}
              </div>
            )}
          </>
        )}

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

        {trend.length >= 2 && (
          <>
            <h1 style={sectionHeading}>Visibility Trend</h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Visibility score per brand across every run so far ({trend.length} runs) — this fills in more with
              every run, not just a single before/after.
            </p>
            <LineChart series={trendSeries} xLabels={trend.map((p) => new Date(p.createdAt).toLocaleDateString())} />
          </>
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

        {report && run && summary && (
          <>
            <h1 style={{ ...sectionHeading, marginTop: 10 }}>Summary</h1>
            <div
              style={{
                background: "var(--bg-alt)",
                border: "1px solid var(--border-soft)",
                borderLeft: "4px solid var(--accent)",
                padding: "14px 18px",
                marginBottom: 14,
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              <p style={{ margin: "0 0 6px" }}>
                This is run <strong>#{runs.length}</strong>
                {runs.length > 1 ? ` since ${new Date(runs[0].createdAt).toLocaleDateString()}` : ""}.{" "}
                <strong>{summary.brand}</strong> ranks <strong>#{summary.brandRank}</strong> of{" "}
                {summary.totalBrandsTracked} brands tracked, with a Visibility Score of{" "}
                <strong>{summary.brandVisibilityScore}</strong>
                {summary.brandRank === 1 ? (
                  <> — the category leader across {summary.totalTopics} scanned topics.</>
                ) : (
                  <>
                    {" "}
                    — <strong>{summary.gapToLeader}</strong> points behind category leader{" "}
                    <strong>{summary.overallLeader}</strong> ({summary.overallLeaderScore}), across{" "}
                    {summary.totalTopics} scanned topics.
                  </>
                )}
              </p>
              {summary.strongestTheme && summary.weakestTheme && summary.strongestTheme.theme !== summary.weakestTheme.theme && (
                <p style={{ margin: "0 0 6px" }}>
                  Strongest theme: <strong>{summary.strongestTheme.theme}</strong> (score{" "}
                  {summary.strongestTheme.score}). Weakest: <strong>{summary.weakestTheme.theme}</strong> (score{" "}
                  {summary.weakestTheme.score}).
                </p>
              )}
              {summary.biggestMover && (
                <p style={{ margin: 0 }}>
                  Biggest move since the last run: <strong>{summary.biggestMover.brand}</strong>{" "}
                  <Delta value={summary.biggestMover.citationRateDelta} /> citation rate.
                </p>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 4px" }}>
              This run used{" "}
              <strong>{run.promptMode === "keyword" ? "keywords as-is" : "rewritten shopper questions"}</strong>{" "}
              as the prompt sent to Claude.
            </p>
            <h1 style={sectionHeading}>0. Market Share Snapshot</h1>
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
              The themes actually scanned this run — the ones you tracked above.
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

            <h1 style={sectionHeading}>3. Topic-Level Breakdown</h1>
            <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 11.5, margin: "0 0 14px" }}>
              Every scanned topic, expandable — who was mentioned/cited (including every competitor site), the
              actual question asked, and the real cited URLs per brand.
            </p>
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
            {filteredTopicRows.map(({ result, leader }) => (
              <BulkTopicRow
                key={result.id}
                result={result}
                brandName={universe.brand}
                competitorNames={competitorNames}
                leader={leader}
              />
            ))}
            <p style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--text-muted)", margin: "12px 0 0" }}>
              Filled dot = cited (a real URL on that domain showed up as a source). Amber dot = mentioned by name
              but no URL cited.
            </p>

            <h1 style={sectionHeading}>4. Cited Pages</h1>
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
