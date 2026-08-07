"use client";

import { useState } from "react";
import type { BulkScanTopicResult } from "@/lib/types";

function StatusDot({ mentioned, cited }: { mentioned: boolean; cited: boolean }) {
  const color = cited ? "var(--good)" : mentioned ? "var(--warn)" : "var(--border)";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />;
}

export default function BulkTopicRow({
  result,
  brandName,
  competitorNames,
  leader,
}: {
  result: BulkScanTopicResult;
  brandName: string;
  competitorNames: string[];
  leader?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const brandCited = result.brandCitations.length > 0;

  return (
    <div style={{ borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: open ? "var(--bg-alt)" : "var(--bg-elevated)",
          border: "none",
          color: "inherit",
          padding: "10px 10px",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "1.6fr 0.6fr 0.7fr 1.2fr auto",
          gap: 10,
          alignItems: "center",
          fontFamily: "inherit",
          fontSize: 12.5,
        }}
      >
        <span>
          {result.topic}
          {leader && (
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 8 }}>
              leader: {leader}
            </span>
          )}
        </span>
        <span style={{ color: "var(--text-muted)" }}>{result.priorityTier || "—"}</span>
        <span style={{ color: "var(--text-muted)" }}>
          {result.volume ? result.volume.toLocaleString() : "—"}
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span title={`${brandName}: ${brandCited ? "cited" : result.brandMentioned ? "mentioned" : "absent"}`} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <StatusDot mentioned={result.brandMentioned} cited={brandCited} />
            <strong>{brandName}</strong>
          </span>
          {competitorNames.map((name) => {
            const cited = (result.competitorCitations[name] || []).length > 0;
            const mentioned = Boolean(result.competitorsMentioned[name]);
            if (!cited && !mentioned) return null;
            return (
              <span key={name} title={`${name}: ${cited ? "cited" : "mentioned"}`} style={{ display: "flex", gap: 4, alignItems: "center", color: "var(--text-muted)" }}>
                <StatusDot mentioned={mentioned} cited={cited} />
                {name}
              </span>
            );
          })}
        </span>
        <span style={{ color: "var(--text-muted)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 10px 16px", fontSize: 12.5, background: "var(--bg-alt)" }}>
          {result.status === "error" ? (
            <div style={{ color: "var(--danger)" }}>Failed: {result.error}</div>
          ) : (
            <>
              <div style={{ color: "var(--text-muted)", marginBottom: 8, fontStyle: "italic" }}>
                Question asked: <em>{result.question}</em>
              </div>
              {result.brandCitations.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <strong>{brandName} cited:</strong>{" "}
                  {result.brandCitations.map((c) => (
                    <a key={c.url} href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginRight: 10 }}>
                      {c.title || c.url}
                    </a>
                  ))}
                </div>
              )}
              {Object.entries(result.competitorCitations).map(
                ([name, urls]) =>
                  urls.length > 0 && (
                    <div key={name} style={{ marginBottom: 6 }}>
                      <strong>{name} cited:</strong>{" "}
                      {urls.map((c) => (
                        <a key={c.url} href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--series-3)", marginRight: 10 }}>
                          {c.title || c.url}
                        </a>
                      ))}
                    </div>
                  )
              )}
              <div
                className="mono"
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--text-muted)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-soft)",
                  padding: "10px 12px",
                  marginTop: 10,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {result.responseText || "(no response recorded)"}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
