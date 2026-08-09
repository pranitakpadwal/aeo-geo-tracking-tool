import { redirect } from "next/navigation";
import BulkScanForm from "@/components/BulkScanForm";
import { isConfigured } from "@/lib/anthropic";
import { getCurrentUser } from "@/lib/session";

export default async function BulkScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const configured = isConfigured();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Bulk citation scan</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 640, lineHeight: 1.6, marginBottom: 28 }}>
        Import a topic/keyword list (e.g. a SEMrush export bucketed into topics) and run the same citation
        check across all of it at once — grounded with real web search, so this tracks actual cited URLs, not
        just name mentions.
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
          <strong>ANTHROPIC_API_KEY is not set</strong> on this server, so bulk scans can&rsquo;t run yet.
        </div>
      )}

      <BulkScanForm />
    </div>
  );
}
