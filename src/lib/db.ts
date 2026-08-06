import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Single-file SQLite database. Fine for one instance; set DATABASE_PATH to a
// persistent volume in production (see README) or snapshots/history resets
// on every deploy.
const DEFAULT_PATH = path.join(process.cwd(), "data", "tracker.db");
const dbPath = process.env.DATABASE_PATH || DEFAULT_PATH;

if (!process.env.DATABASE_PATH) {
  fs.mkdirSync(path.dirname(DEFAULT_PATH), { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    domain TEXT,
    industry TEXT NOT NULL,
    competitors TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    site_audit TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'generated'
  );

  CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    prompt_id INTEGER NOT NULL REFERENCES scan_prompts(id) ON DELETE CASCADE,
    response_text TEXT NOT NULL,
    brand_mentioned INTEGER NOT NULL,
    brand_position REAL,
    competitors_mentioned TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_scan_prompts_scan ON scan_prompts(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scan_results_scan ON scan_results(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scans_brand ON scans(brand, domain);
`);

export default db;
