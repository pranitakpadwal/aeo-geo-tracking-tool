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

  -- Bulk scans: same idea as scans, but driven by an imported list of topics
  -- (e.g. a SEMrush/keyword-research export) instead of a handful of manually
  -- typed prompts. One row per topic, each carrying its own priority/volume
  -- metadata so results can be sliced by tier afterward.
  CREATE TABLE IF NOT EXISTS bulk_scans (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    domain TEXT,
    competitors TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    total_topics INTEGER NOT NULL DEFAULT 0,
    completed_topics INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS bulk_scan_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bulk_scan_id TEXT NOT NULL REFERENCES bulk_scans(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    topic TEXT NOT NULL,
    type TEXT,
    priority_tier TEXT,
    volume INTEGER,
    question TEXT,
    response_text TEXT,
    brand_mentioned INTEGER,
    brand_position REAL,
    competitors_mentioned TEXT NOT NULL DEFAULT '{}',
    brand_citations TEXT NOT NULL DEFAULT '[]',
    competitor_citations TEXT NOT NULL DEFAULT '{}',
    other_citations TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bulk_scan_topics_scan ON bulk_scan_topics(bulk_scan_id);

  -- Universes: a persistent brand+category tracker. A universe is set up
  -- once (brand, domain, competitors, fixed topic list) and then re-run over
  -- time, each run producing a bulk_scans row — so trends/movement compound
  -- across runs instead of the user re-uploading a CSV every time.
  CREATE TABLE IF NOT EXISTS universes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    domain TEXT,
    competitors TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS universe_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    type TEXT,
    priority_tier TEXT,
    volume INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_universe_topics_universe ON universe_topics(universe_id);
`);

// bulk_scans.universe_id: nullable so existing one-off bulk scans (created
// before universes existed, or still run standalone via /bulk-scan) keep
// working unchanged. Added defensively since SQLite has no
// "ADD COLUMN IF NOT EXISTS".
const bulkScanColumns = db.prepare(`PRAGMA table_info(bulk_scans)`).all() as { name: string }[];
if (!bulkScanColumns.some((c) => c.name === "universe_id")) {
  db.exec(`ALTER TABLE bulk_scans ADD COLUMN universe_id TEXT REFERENCES universes(id)`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_bulk_scans_universe ON bulk_scans(universe_id);`);

export default db;
