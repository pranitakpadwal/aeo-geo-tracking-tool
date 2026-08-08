"use client";

import { useEffect, useRef } from "react";

export const SERIES_COLORS = [
  "var(--accent)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

// Resolve a CSS custom property to its computed hex/rgb so <canvas> (which
// doesn't understand var(...)) can use it.
export function resolveColor(token: string): string {
  if (typeof window === "undefined") return "#000";
  if (!token.startsWith("var(")) return token;
  const name = token.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

export function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, borderRadius: 2, background: "var(--border-soft)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Delta({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: "var(--text-faint)" }}>±0</span>;
  const up = value > 0;
  return (
    <span style={{ color: up ? "var(--good)" : "var(--danger)", fontWeight: 700 }}>
      {up ? "▲" : "▼"} {Math.abs(value)}pt
    </span>
  );
}

export function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
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

export function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
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

export function statusFor(citationRate: number, maxOther: number, hasCitations: boolean): "leader" | "behind" | "lost" {
  if (!hasCitations && citationRate === 0) return "lost";
  if (citationRate >= maxOther) return "leader";
  return "behind";
}

export const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  leader: { bg: "var(--good-bg)", text: "var(--good)", label: "Leader" },
  behind: { bg: "var(--danger-bg)", text: "var(--danger)", label: "Behind" },
  lost: { bg: "var(--warn-bg)", text: "var(--warn)", label: "No citations" },
};

export function brandColor(name: string, brands: { name: string }[]): string {
  return SERIES_COLORS[brands.findIndex((b) => b.name === name) % SERIES_COLORS.length];
}
