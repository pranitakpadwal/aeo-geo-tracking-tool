"use client";

import { useState } from "react";
import type { PromptResult } from "@/lib/types";

export default function PromptCard({ result }: { result: PromptResult }) {
  const [open, setOpen] = useState(false);
  const mentionedCompetitors = Object.entries(result.competitorsMentioned).filter(
    ([, v]) => v
  );

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          color: "inherit",
          padding: "14px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: result.brandMentioned ? "var(--good)" : "var(--border)",
          }}
        />
        <span style={{ flex: 1, fontSize: 15 }}>{result.prompt}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {result.brandMentioned ? "cited" : "not cited"}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          {mentionedCompetitors.length > 0 && (
            <div style={{ margin: "12px 0", fontSize: 13, color: "var(--text-muted)" }}>
              Also cited: {mentionedCompetitors.map(([name]) => name).join(", ")}
            </div>
          )}
          <div
            className="mono"
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text-muted)",
              marginTop: 12,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {result.responseText || "(no response recorded)"}
          </div>
        </div>
      )}
    </div>
  );
}
