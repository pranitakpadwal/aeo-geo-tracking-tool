"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readTopicsFile } from "@/lib/read-topics-file";
import type { CsvTopicRow } from "@/lib/csv";
import type { PromptMode } from "@/lib/types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 15,
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-muted)",
  marginBottom: 6,
};

function parseCompetitors(text: string): { name: string; domain?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, domain] = line.split(",").map((s) => s.trim());
      return domain ? { name, domain } : { name };
    })
    .filter((c) => c.name);
}

export default function BulkScanForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [topics, setTopics] = useState<CsvTopicRow[]>([]);
  const [promptMode, setPromptMode] = useState<PromptMode>("question");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    try {
      setTopics(await readTopicsFile(file));
    } catch (err) {
      setTopics([]);
      setFileError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (topics.length === 0) {
      setError("Upload a topics CSV first (column: topic, plus optional type/priority_tier/volume).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bulk-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          domain,
          competitors: parseCompetitors(competitorsText),
          topics,
          promptMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bulk scan failed to start.");
        setLoading(false);
        return;
      }
      router.push(`/bulk-scan/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      {error && (
        <div
          style={{
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>Brand name</label>
          <input style={inputStyle} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nykaa" required />
        </div>
        <div>
          <label style={labelStyle}>Website (required — citations are matched to this domain)</label>
          <input
            style={inputStyle}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="nykaa.com"
            required
          />
        </div>
      </div>
      <div>
        <label style={labelStyle}>
          Competitors — one per line, as <span className="mono">name, domain</span> (domain optional but
          needed for citation-URL tracking on that competitor)
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
          value={competitorsText}
          onChange={(e) => setCompetitorsText(e.target.value)}
          placeholder={"Purplle, purplle.com\nMyntra, myntra.com\nAmazon.in, amazon.in\nTira, tirabeauty.com\nAJIO, ajio.com"}
        />
      </div>
      <div>
        <label style={labelStyle}>
          Topics — as a <span className="mono">.csv</span> or <span className="mono">.xlsx</span> file. Column{" "}
          <span className="mono">topic</span> required; <span className="mono">category</span>,{" "}
          <span className="mono">type</span>, <span className="mono">priority_tier</span>,{" "}
          <span className="mono">volume</span> optional (extra columns are ignored). No{" "}
          <span className="mono">category</span>? Leave it out entirely — we&rsquo;ll auto-group your topics into
          themes with Claude before running.
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFileChange}
          style={{ fontSize: 14 }}
        />
        {fileError && (
          <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 6 }}>{fileError}</div>
        )}
        {fileName && !fileError && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            {fileName} — {topics.length} topic{topics.length === 1 ? "" : "s"} parsed
            {topics.length > 0 && (
              <>
                {" "}
                (e.g. &ldquo;{topics[0].topic}&rdquo;
                {topics[0].priorityTier ? `, ${topics[0].priorityTier}` : ""})
              </>
            )}
          </div>
        )}
      </div>
      <div>
        <label style={labelStyle}>Prompt — what gets sent to Claude for each topic</label>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
            <input
              type="radio"
              name="promptMode"
              checked={promptMode === "question"}
              onChange={() => setPromptMode("question")}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Rewrite into a shopper question (recommended)</strong> — e.g. topic{" "}
              <span className="mono">shampoo</span> becomes &ldquo;what&rsquo;s the best shampoo for dry
              hair&rdquo; before asking Claude. Matches how real AI-answer-engine users actually phrase things.
            </span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
            <input
              type="radio"
              name="promptMode"
              checked={promptMode === "keyword"}
              onChange={() => setPromptMode("keyword")}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Use the keyword as-is</strong> — sends the bare topic/keyword string straight to Claude,
              unmodified (e.g. just <span className="mono">shampoo</span>). Useful for comparing how
              visibility/mentions/citations/cited pages differ from the rewritten version, for the same topic
              list.
            </span>
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          background: loading ? "var(--border)" : "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 20px",
          fontSize: 15,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {loading ? "Starting…" : `Run bulk citation scan${topics.length ? ` (${topics.length} topics)` : ""}`}
      </button>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Each topic costs one grounded (real web-search) Claude call, plus a shared batch call to turn topics
        into shopper questions. Runs in the background — this page moves on immediately; the next page polls
        for progress.
      </p>
    </form>
  );
}
