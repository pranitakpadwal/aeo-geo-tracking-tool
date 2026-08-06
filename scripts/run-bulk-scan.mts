#!/usr/bin/env -S npx tsx
/**
 * Headless runner for a bulk citation scan — useful for a large topic list
 * (hundreds of rows) you'd rather kick off from a terminal/cron than babysit
 * in a browser tab. Talks directly to the same lib the web app uses, so
 * results land in the same SQLite DB and are viewable at /bulk-scan/[id].
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run bulk-scan -- \
 *     --brand "Nykaa" --domain nykaa.com \
 *     --competitors "Purplle:purplle.com,Myntra:myntra.com,Amazon.in:amazon.in,Tira:tirabeauty.com,AJIO:ajio.com" \
 *     --topics scripts/data/nykaa-topics-p0-p1.csv
 *
 * --competitors accepts "Name:domain" pairs (domain optional), comma-separated.
 * --topics points at a CSV with a `topic` column (type/priority_tier/volume optional).
 */
import fs from "fs";
import path from "path";
import { createBulkScan, getBulkScan, runBulkScan } from "../src/lib/bulk-scan.ts";
import type { BulkScanInput } from "../src/lib/types.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = value;
    }
  }
  return out;
}

function parseCompetitors(spec: string | undefined): { name: string; domain?: string }[] {
  if (!spec) return [];
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [name, domain] = pair.split(":").map((s) => s.trim());
      return domain ? { name, domain } : { name };
    });
}

function parseTopicsFile(filePath: string): BulkScanInput["topics"] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const topicIdx = header.indexOf("topic");
  const typeIdx = header.indexOf("type");
  const tierIdx = header.indexOf("priority_tier");
  const volumeIdx = header.indexOf("volume");
  if (topicIdx === -1) {
    throw new Error(`${filePath}: no "topic" column found in header: ${header.join(", ")}`);
  }

  return lines.slice(1).map((line) => {
    // Naive split is fine here — the shipped export has no embedded commas
    // in these columns. Swap in the app's parseTopicsCsv() if yours does.
    const cols = line.split(",");
    return {
      topic: cols[topicIdx]?.trim(),
      type: typeIdx >= 0 ? cols[typeIdx]?.trim() || undefined : undefined,
      priorityTier: tierIdx >= 0 ? cols[tierIdx]?.trim() || undefined : undefined,
      volume: volumeIdx >= 0 && cols[volumeIdx] ? Number(cols[volumeIdx]) || undefined : undefined,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }
  if (!args.brand || !args.domain || !args.topics) {
    console.error("Required: --brand <name> --domain <domain> --topics <csv path>");
    process.exit(1);
  }

  const topicsPath = path.resolve(args.topics);
  const topics = parseTopicsFile(topicsPath);
  const competitors = parseCompetitors(args.competitors);

  console.log(`Brand: ${args.brand} (${args.domain})`);
  console.log(`Competitors: ${competitors.map((c) => c.name).join(", ") || "(none)"}`);
  console.log(`Topics: ${topics.length} from ${topicsPath}`);
  console.log("");

  const input: BulkScanInput = { brand: args.brand, domain: args.domain, competitors, topics };
  const id = createBulkScan(input);
  console.log(`Created bulk scan ${id} — running sequentially (this will take a while for a large list)...`);

  await runBulkScan(id, input);

  const result = getBulkScan(id);
  console.log("");
  console.log(`Done. Status: ${result?.status}`);
  console.log(`View at: /bulk-scan/${id}  (report at /api/bulk-scan/${id}/report)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
