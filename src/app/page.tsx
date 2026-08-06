import ScanForm from "@/components/ScanForm";
import { isConfigured } from "@/lib/anthropic";

export default function HomePage() {
  const configured = isConfigured();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.2, margin: "0 0 12px" }}>
          Is your brand actually showing up in AI answers?
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 16, maxWidth: 640, lineHeight: 1.6 }}>
          Semrush-style rank tracking tells you nothing about ChatGPT, Perplexity, or Google&rsquo;s
          AI Overviews. This asks Claude to answer the questions your customers actually type into
          those assistants — then checks whether you, or your competitors, get named.
        </p>
      </div>

      {!configured && (
        <div
          style={{
            border: "1px solid var(--warn)",
            color: "var(--warn)",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 14,
            marginBottom: 24,
            maxWidth: 640,
          }}
        >
          <strong>ANTHROPIC_API_KEY is not set</strong> on this server, so scans can&rsquo;t run
          yet. Set it in your environment (see README) and reload.
        </div>
      )}

      <ScanForm />

      <div
        style={{
          marginTop: 56,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          maxWidth: 900,
        }}
      >
        {[
          {
            title: "Citation tracking",
            body: "We simulate the exact question a customer would ask an AI assistant, and check if your brand gets named in the answer.",
          },
          {
            title: "Competitor share of voice",
            body: "Same prompts, same answers — see who else gets cited instead of you, and how often.",
          },
          {
            title: "Site readiness audit",
            body: "Checks robots.txt, llms.txt, and structured data against what AI crawlers actually look for.",
          },
        ].map((f) => (
          <div
            key={f.title}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 18,
              background: "var(--bg-elevated)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{f.title}</div>
            <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
