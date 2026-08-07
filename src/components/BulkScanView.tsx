"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BulkTopicRow from "./BulkTopicRow";
import type { BulkScanDetail } from "@/lib/types";
import type { BulkScanReport } from "@/lib/report";

const SERIES_COLORS = [
  "var(--accent)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

// Resolve a CSS custom property to its computed hex/rgb so <canvas> (which
// doesn't understand var(...)) can use it.
function resolveColor(token: string): string {
  if (typeof window === "undefined") return "#000";
  if (!token.startsWith("var(")) return token;
  const name = token.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, borderRadius: 2, background: "var(--border-soft)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: "var(--text-faint)" }}>±0</span>;
  const up = value > 0;
  return (
    <span style={{ color: up ? "var(--good)" : "var(--danger)", fontWeight: 700 }}>
      {up ? "▲" : "▼"} {Math.abs(value)}pt
    </span>
  );
}

function statusFor(citationRate: number, maxOther: number, hasCitations: boolean): "leader" | "behind" | "lost" {
  if (!hasCitations && citationRate === 0) return "lost";
  if (citationRate >= maxOther) return "leader";
  return "behind";
}

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  leader: { bg: "var(--good-bg)", text: "var(--good)", label: "Leader" },
  behind: { bg: "var(--danger-bg)", text: "var(--danger)", label: "Behind" },
  lost: { bg: "var(--warn-bg)", text: "var(--warn)", label: "No citations" },
};

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.scale(dpr, dpr);

    const cx = size / 2,
      cy = size / 2 - 6,
      r = 76;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let start = -Math.PI / 2;

    ctx.clearRect(0, 0, size, size);
    data.forEach((d) => {
      const angle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = resolveColor(d.color);
      ctx.fill();

      const pct = (d.value / total) * 100;
      if (pct > 4) {
        const mid = start + angle / 2;
        const lx = cx + Math.cos(mid) * r * 0.62;
        const ly = cy + Math.sin(mid) * r * 0.62;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(pct.toFixed(1) + "%", lx, ly);
      }
      start += angle;
    });
  }, [data]);

  return (
    <div style={{ textAlign: "center" }}>
      <canvas ref={ref} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center", marginTop: 8 }}>
        {data.map((d) => (
          <span key={d.label} style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, display: "inline-block" }} />
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 260,
      h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    const padL = 40,
      padR = 10,
      padT = 16,
      padB = 30;
    const plotW = w - padL - padR,
      plotH = h - padT - padB;
    const max = Math.max(...data.map((d) => d.value), 1) * 1.15;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = resolveColor("var(--border)");
    ctx.fillStyle = resolveColor("var(--text-faint)");
    ctx.font = "9px Arial";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(max - (max / 3) * i)), padL - 6, y + 3);
    }

    const gap = plotW / data.length;
    const bw = gap * 0.5;
    data.forEach((d, i) => {
      const x = padL + gap * i + (gap - bw) / 2;
      const bh = (d.value / max) * plotH;
      const y = padT + plotH - bh;
      ctx.fillStyle = resolveColor(d.color);
      ctx.fillRect(x, y, bw, bh);

      ctx.fillStyle = resolveColor("var(--text)");
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(d.value), x + bw / 2, y - 5);

      ctx.font = "9.5px Arial";
      ctx.fillStyle = resolveColor("var(--text-muted)");
      ctx.fillText(d.label, x + bw / 2, h - 12);
    });
  }, [data]);

  return <canvas ref={ref} style={{ display: "block", margin: "0 auto" }} />;
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
  const zipped = scan.topics.map((t, i) => ({ result: t, leader: report?.topics[i]?.leader ?? null }));
  const filteredRows = zipped.filter(({ result }) => tierFilter === "all" || result.priorityTier === tierFilter);

  const brandColor = (name: string, brands: { name: string }[]) =>
    SERIES_COLORS[brands.findIndex((b) => b.name === name) % SERIES_COLORS.length];

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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 6 }}>
                <thead>
                  <tr>
                    {["Brand", "Mention rate", "Citation rate", "Distinct URLs", "Share of citations", "Status"]
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
              2. Topic-Level Breakdown
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
