"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

export default function ScanForm() {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [customPrompts, setCustomPrompts] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          domain,
          industry,
          competitors: competitors
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          customPrompts: customPrompts
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scan failed.");
        setLoading(false);
        return;
      }
      router.push(`/scan/${data.id}`);
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
          <input
            style={inputStyle}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Acme Analytics"
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Website (optional)</label>
          <input
            style={inputStyle}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
          />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Industry / what you do</label>
        <input
          style={inputStyle}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. project management software for creative agencies"
          required
        />
      </div>
      <div>
        <label style={labelStyle}>Competitors (comma-separated, optional)</label>
        <input
          style={inputStyle}
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
          placeholder="Semrush, Ahrefs, Moz"
        />
      </div>
      <div>
        <label style={labelStyle}>
          Your own prompts (optional, one per line — skip to auto-generate)
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
          value={customPrompts}
          onChange={(e) => setCustomPrompts(e.target.value)}
          placeholder={"what's the best rank tracking tool for AI search?\nhow do I know if ChatGPT is citing my brand?"}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          background: loading ? "var(--border)" : "var(--accent)",
          color: "#06110f",
          border: "none",
          borderRadius: 8,
          padding: "12px 20px",
          fontSize: 15,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {loading ? "Running scan — this takes ~30-60s…" : "Run AEO/GEO scan"}
      </button>
    </form>
  );
}
