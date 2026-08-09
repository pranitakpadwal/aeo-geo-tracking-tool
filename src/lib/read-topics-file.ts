"use client";

import { parseTopicRows, parseTopicsCsv, type CsvTopicRow } from "./csv";

/**
 * Reads an uploaded topics file — .csv or .xlsx — into the same
 * CsvTopicRow[] shape either way, so the rest of the app (forms, upload
 * preview, POST body) doesn't need to know which format the user picked.
 * XLSX parsing (SheetJS) is dynamically imported so the ~1MB library only
 * loads when someone actually uploads an .xlsx file.
 */
export async function readTopicsFile(file: File): Promise<CsvTopicRow[]> {
  const isXlsx =
    /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (!isXlsx) {
    return parseTopicsCsv(await file.text());
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  // header: 1 -> array-of-arrays (same shape our CSV parser produces),
  // raw: false -> cell values come out as display strings, not numbers/
  // dates, so downstream parsing (Number(), .trim()) behaves the same
  // regardless of which format the topic list came in as.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  const stringRows = rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
  return parseTopicRows(stringRows);
}
