import UniverseForm from "@/components/UniverseForm";
import { isConfigured } from "@/lib/anthropic";

export default function NewUniversePage() {
  const configured = isConfigured();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>New universe</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 640, lineHeight: 1.6, marginBottom: 28 }}>
        A universe is your category, set up once: brand, competitors, and a fixed topic list. From then on,
        you get a persistent dashboard — mentions, citations, and cited pages broken into themes, moving up
        or down every time you run it again. No re-uploading a CSV for every check-in.
      </p>

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
          <strong>ANTHROPIC_API_KEY is not set</strong> on this server, so universe runs can&rsquo;t run yet.
        </div>
      )}

      <UniverseForm />
    </div>
  );
}
