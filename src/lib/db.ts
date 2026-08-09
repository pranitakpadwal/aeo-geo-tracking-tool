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
    category TEXT,
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
    category TEXT,
    priority_tier TEXT,
    volume INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_universe_topics_universe ON universe_topics(universe_id);

  -- Accounts: so a universe/bulk-scan's topics, runs and history are tied to
  -- whoever created them and come back when they log back in, instead of
  -- being anonymous/shared. Password hashing is Node's built-in scrypt (see
  -- lib/auth.ts) — no extra native dependency alongside better-sqlite3.
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// Adds a column if it's missing, tolerating "duplicate column name" from a
// second process racing to add the same column at the same time (Next's
// build step spins up several worker processes that each import this file
// fresh against the same SQLite file — SQLite has no
// "ADD COLUMN IF NOT EXISTS", so without this, whichever worker loses the
// race crashes the build). Any other error still throws.
function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("duplicate column name")) throw err;
  }
}

// bulk_scans.universe_id: nullable so existing one-off bulk scans (created
// before universes existed, or still run standalone via /bulk-scan) keep
// working unchanged.
addColumnIfMissing("bulk_scans", "universe_id", `universe_id TEXT REFERENCES universes(id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bulk_scans_universe ON bulk_scans(universe_id);`);

// category: the real sub-category (e.g. "Skincare", "Lips", "Hair Care") a
// topic rolls up into — distinct from `type`, which in imported SEMrush-style
// exports is a content-strategy label ("Baseline", "New Product/Ingredient"),
// not a sub-vertical.
addColumnIfMissing("bulk_scan_topics", "category", `category TEXT`);
addColumnIfMissing("universe_topics", "category", `category TEXT`);

// prompt_mode: "question" (default) rewrites each keyword into a natural
// shopper question before asking Claude (e.g. "shampoo" -> "what's the best
// shampoo for dry hair"). "keyword" skips that rewrite and sends the raw
// keyword/topic string to Claude as-is, so you can see how visibility/
// mentions/citations/cited-pages compare when the prompt is the bare
// keyword vs. a realistic question built from it.
addColumnIfMissing("bulk_scans", "prompt_mode", `prompt_mode TEXT NOT NULL DEFAULT 'question'`);

// user_id: nullable so pre-auth data (created before login existed) doesn't
// break — it just shows up owned by nobody rather than 500ing. New
// universes/bulk-scans always get one from the session going forward.
addColumnIfMissing("universes", "user_id", `user_id TEXT REFERENCES users(id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_universes_user ON universes(user_id);`);
addColumnIfMissing("bulk_scans", "user_id", `user_id TEXT REFERENCES users(id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bulk_scans_user ON bulk_scans(user_id);`);

// --- Large-upload universes (thousands of raw keywords) ---
//
// A universe can now be created from a raw keyword export (up to
// MAX_KEYWORDS) instead of a hand-curated topic list. Scanning every
// keyword with a real grounded (web-search) Claude call would be
// prohibitively expensive at that scale, so the flow splits into two
// cheap-then-selective steps instead of running everything:
//
//   1. Categorize (cheap, no web search): every uploaded keyword gets
//      classified into a theme (category) — see runCategorization() in
//      lib/universe.ts. `universe_topics.category` already existed;
//      `categorization_status` on `universes` tracks that background job.
//   2. Track + run (the expensive step): the user picks which themes
//      matter; only the top-N-by-volume keywords *within* a tracked theme
//      are marked `tracked = 1` and actually get scanned when you hit
//      "Run now" — see setTrackedThemes() in lib/universe.ts. This caps
//      run cost to (tracked themes × TOP_N_PER_THEME) regardless of how
//      many thousand keywords the universe holds overall.
addColumnIfMissing("universes", "categorization_status", `categorization_status TEXT`); // pending|running|complete|error, NULL for pre-existing small universes
addColumnIfMissing("universes", "categorization_error", `categorization_error TEXT`);
// The theme list proposeThemes() settled on, persisted so a retry pass
// (re-running runCategorization on whatever's still uncategorized) reuses
// the same themes instead of proposing a different set and ending up with
// two incompatible theme vocabularies in one universe.
addColumnIfMissing("universes", "theme_list", `theme_list TEXT`);
addColumnIfMissing("universes", "tracked_themes", `tracked_themes TEXT NOT NULL DEFAULT '[]'`); // JSON array of opted-in category values
addColumnIfMissing("universes", "auto_run_enabled", `auto_run_enabled INTEGER NOT NULL DEFAULT 0`);
addColumnIfMissing("universes", "last_auto_run_at", `last_auto_run_at TEXT`);
// 1 = one of the top-N-by-volume keywords in a tracked theme; this is
// exactly the set startUniverseRun() scans.
addColumnIfMissing("universe_topics", "tracked", `tracked INTEGER NOT NULL DEFAULT 0`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_universe_topics_category ON universe_topics(universe_id, category);`);

export default db;
