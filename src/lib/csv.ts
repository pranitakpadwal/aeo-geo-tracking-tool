/**
 * Minimal CSV parser (RFC 4180-ish: handles quoted fields, embedded commas,
 * escaped quotes). No dependency — this runs client-side in the browser to
 * parse an uploaded topics file, so it deliberately stays small.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }

  return rows;
}

export interface CsvTopicRow {
  topic: string;
  type?: string;
  category?: string;
  priorityTier?: string;
  volume?: number;
}

/** Header-flexible: matches by column name (case-insensitive), tolerates
 * extra columns (e.g. "rank", "top_matching_keyword") by ignoring them.
 * Shared by the CSV path (parseCsv -> rows) and the XLSX path
 * (SheetJS sheet_to_json({ header: 1 }) -> rows) — both just need to
 * produce string[][] first. */
export function parseTopicRows(rows: string[][]): CsvTopicRow[] {
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, "_"));
  const topicIdx = header.findIndex((h) => h === "topic" || h === "keyword");
  const typeIdx = header.findIndex((h) => h === "type");
  // "category" is the real sub-vertical (Skincare, Lips, Hair Care, ...) —
  // distinct from "type", which is usually a content-strategy label.
  const categoryIdx = header.findIndex((h) => h === "category" || h === "sub_category" || h === "subcategory");
  const tierIdx = header.findIndex((h) => h === "priority_tier" || h === "tier" || h === "priority");
  const volumeIdx = header.findIndex((h) => h === "volume" || h === "search_volume");

  if (topicIdx === -1) {
    // No recognizable header — treat every non-empty first-column value as a bare topic list.
    return rows.filter((r) => r[0]?.trim()).map((r) => ({ topic: r[0].trim() }));
  }

  return rows
    .slice(1)
    .filter((r) => r[topicIdx]?.trim())
    .map((r) => ({
      topic: r[topicIdx].trim(),
      type: typeIdx >= 0 ? r[typeIdx]?.trim() || undefined : undefined,
      category: categoryIdx >= 0 ? r[categoryIdx]?.trim() || undefined : undefined,
      priorityTier: tierIdx >= 0 ? r[tierIdx]?.trim() || undefined : undefined,
      volume: volumeIdx >= 0 && r[volumeIdx] ? Number(r[volumeIdx].replace(/,/g, "")) || undefined : undefined,
    }));
}

export function parseTopicsCsv(text: string): CsvTopicRow[] {
  return parseTopicRows(parseCsv(text));
}
