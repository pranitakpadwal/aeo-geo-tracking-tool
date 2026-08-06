import { randomUUID } from "crypto";
import db from "./db";
import { answerPrompt, generatePrompts } from "./anthropic";
import { findCompetitorMentions, findMention } from "./analyze";
import { auditSite } from "./site-audit";
import type { PromptResult, ScanDetail, ScanInput, ScanRecord } from "./types";

const GENERATED_PROMPT_COUNT = 8;

export function createScan(input: ScanInput): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO scans (id, brand, domain, industry, competitors, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, input.brand, input.domain || null, input.industry, JSON.stringify(input.competitors));
  return id;
}

/**
 * Runs the whole scan synchronously: generates prompts (unless the caller
 * supplied their own), queries Claude for each as a simulated AI-answer-engine
 * response, analyzes brand/competitor mentions, audits the site, and persists
 * everything. Intended to run inside the API route handler for the scan.
 */
export async function runScan(scanId: string, input: ScanInput): Promise<void> {
  db.prepare(`UPDATE scans SET status = 'running' WHERE id = ?`).run(scanId);

  try {
    let prompts: { text: string; source: "generated" | "custom" }[] = input.customPrompts
      .filter((p) => p.trim())
      .map((p) => ({ text: p.trim(), source: "custom" as const }));

    if (prompts.length < GENERATED_PROMPT_COUNT) {
      const generated = await generatePrompts({
        brand: input.brand,
        industry: input.industry,
        domain: input.domain,
        count: GENERATED_PROMPT_COUNT - prompts.length,
      });
      prompts = prompts.concat(generated.map((text) => ({ text, source: "generated" as const })));
    }

    const insertPrompt = db.prepare(
      `INSERT INTO scan_prompts (scan_id, idx, prompt, source) VALUES (?, ?, ?, ?)`
    );
    const insertResult = db.prepare(
      `INSERT INTO scan_results
        (scan_id, prompt_id, response_text, brand_mentioned, brand_position, competitors_mentioned)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    // Run sequentially — keeps this simple and avoids bursting rate limits
    // on a handful of prompts per scan.
    for (let i = 0; i < prompts.length; i++) {
      const { text, source } = prompts[i];
      const promptId = insertPrompt.run(scanId, i, text, source).lastInsertRowid as number;

      const responseText = await answerPrompt(text);
      const brandMention = findMention(responseText, input.brand, input.domain);
      const competitorsMentioned = findCompetitorMentions(responseText, input.competitors);

      insertResult.run(
        scanId,
        promptId,
        responseText,
        brandMention.mentioned ? 1 : 0,
        brandMention.position,
        JSON.stringify(competitorsMentioned)
      );
    }

    let siteAuditJson: string | null = null;
    if (input.domain) {
      try {
        const audit = await auditSite(input.domain);
        siteAuditJson = JSON.stringify(audit);
      } catch {
        // Site audit is best-effort; a failure here shouldn't fail the scan.
      }
    }

    db.prepare(
      `UPDATE scans SET status = 'complete', site_audit = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(siteAuditJson, scanId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare(`UPDATE scans SET status = 'error', error = ? WHERE id = ?`).run(message, scanId);
    throw err;
  }
}

interface ScanRow {
  id: string;
  brand: string;
  domain: string | null;
  industry: string;
  competitors: string;
  status: ScanRecord["status"];
  error: string | null;
  site_audit: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ScanPromptRow {
  id: number;
  scan_id: string;
  idx: number;
  prompt: string;
  source: "generated" | "custom";
}

interface ScanResultRow {
  id: number;
  scan_id: string;
  prompt_id: number;
  response_text: string;
  brand_mentioned: number;
  brand_position: number | null;
  competitors_mentioned: string;
  created_at: string;
}

function rowToScanRecord(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    brand: row.brand,
    domain: row.domain,
    industry: row.industry,
    competitors: JSON.parse(row.competitors || "[]"),
    status: row.status,
    error: row.error,
    siteAudit: row.site_audit ? JSON.parse(row.site_audit) : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function getScan(id: string): ScanDetail | null {
  const row = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(id) as ScanRow | undefined;
  if (!row) return null;

  const promptRows = db
    .prepare(`SELECT * FROM scan_prompts WHERE scan_id = ? ORDER BY idx ASC`)
    .all(id) as ScanPromptRow[];
  const resultRows = db
    .prepare(`SELECT * FROM scan_results WHERE scan_id = ?`)
    .all(id) as ScanResultRow[];
  const resultsByPrompt = new Map(resultRows.map((r) => [r.prompt_id, r]));

  const results: PromptResult[] = promptRows.map((p) => {
    const r = resultsByPrompt.get(p.id);
    return {
      promptId: p.id,
      prompt: p.prompt,
      source: p.source,
      responseText: r?.response_text ?? "",
      brandMentioned: Boolean(r?.brand_mentioned),
      brandPosition: r?.brand_position ?? null,
      competitorsMentioned: r ? JSON.parse(r.competitors_mentioned || "{}") : {},
    };
  });

  return { ...rowToScanRecord(row), results };
}

export function listScans(limit = 50): ScanRecord[] {
  const rows = db
    .prepare(`SELECT * FROM scans ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as ScanRow[];
  return rows.map(rowToScanRecord);
}

export function listScansForBrand(brand: string, domain?: string | null): ScanRecord[] {
  const rows = (domain
    ? db
        .prepare(`SELECT * FROM scans WHERE brand = ? AND domain = ? AND status = 'complete' ORDER BY created_at ASC`)
        .all(brand, domain)
    : db
        .prepare(`SELECT * FROM scans WHERE brand = ? AND status = 'complete' ORDER BY created_at ASC`)
        .all(brand)) as ScanRow[];
  return rows.map(rowToScanRecord);
}
