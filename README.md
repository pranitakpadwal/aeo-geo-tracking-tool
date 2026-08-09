# Citable — an AEO/GEO tracking tool

Semrush-style rank trackers watch Google. This watches **AI answer engines**
— ChatGPT, Perplexity, Google AI Overviews — and tells you whether your
brand actually gets *cited* when someone asks the question you'd want to
rank for.

## How it works

There's no API that lets you query "what does ChatGPT say" at scale, so this
takes the closest honest substitute: it asks Claude to **answer the question
the way a knowledgeable AI assistant would** (a direct, well-researched
answer naming real companies/products — the same shape ChatGPT/Perplexity/AI
Overviews give), then checks the answer text for your brand and your named
competitors. Run the same scan weekly and you get a real trend line, not a
guess.

1. **Prompt generation** (`src/lib/anthropic.ts` → `generatePrompts`) — given
   your brand, industry, and (optionally) your own prompts, Claude generates
   realistic high-intent questions a customer would type into an AI
   assistant while researching your space.
2. **Simulated answers** (`answerPrompt`) — each prompt is sent to Claude
   again, this time asked to answer it directly, the way an answer engine
   would.
3. **Mention detection** (`src/lib/analyze.ts`) — pure string/regex matching
   (no LLM) checks whether your brand name or domain appears in the answer,
   how early, and which competitors also show up. Deterministic and
   auditable — no black-box scoring.
4. **Site readiness audit** (`src/lib/site-audit.ts`) — a best-effort,
   unauthenticated check of your site's `robots.txt` (is it blocking
   GPTBot/PerplexityBot/ClaudeBot/Google-Extended?), `llms.txt`, and
   structured data (JSON-LD, FAQPage schema) — the concrete things that make
   a site easier for an AI crawler to cite confidently.
5. Everything is persisted to SQLite (`src/lib/db.ts`) so repeat scans of the
   same brand build a trend line (see the "Trend over time" chart on a scan
   page once you have 2+ completed scans).

## Pages

- `/` — quick single-brand scan (auto-generated prompts, mention detection
  only — see "Two scan modes" below)
- `/scan/[id]` — citation rate, share of voice vs named competitors, site
  readiness checklist, and every prompt with its full simulated answer
  (expand to read)
- `/bulk-scan` — import a topic/keyword list (e.g. a SEMrush export bucketed
  into topics) and run the full citation report across all of it, grounded
  with real web search
- `/bulk-scan/[id]` — the report: site-level mentions/citations/share of
  citations vs. every competitor, topic-level breakdown with a "leader" per
  topic, and week-over-week movement once you've run it more than once for
  the same brand
- `/universe` — your saved Universes (persistent brand+topic-list trackers);
  `/universe/new` to create one, `/universe/[id]` for its dashboard
- `/history` — all past quick scans
- `/login`, `/register` — accounts. Universes and bulk scans are tied to
  whoever created them (see "Accounts" below); log back in and they're
  still there.

## Accounts

Registering (`/register`) creates a row in `users` and a session cookie
(`citable_session`, 30-day expiry, `httpOnly`). Session tokens live in a
`sessions` table — see `src/lib/auth.ts` (password hashing is Node's
built-in `scrypt`, no extra dependency) and `src/lib/session.ts`
(`getCurrentUser()`, the server-side cookie → user lookup).

Every Universe and bulk scan is stamped with the creating user's id.
Creating one requires being logged in; viewing/running one requires being
its owner — enforced both at the API layer (`getUniverseOwner` /
`getBulkScanOwner` in `src/lib/universe.ts` / `src/lib/bulk-scan.ts`) and at
the page layer (redirect to `/login`, or a 404 if it's someone else's).
Data created before accounts existed has `user_id = NULL` and is
grandfathered as viewable by anyone with the link — it isn't retroactively
locked out, but it also won't show up in anyone's `/universe` list.

The `secure` cookie flag is on automatically once `NODE_ENV=production`
(which `next start` sets on its own) — a plain-HTTP deployment won't be
able to log in. Railway (and most real hosts) terminate HTTPS in front of
your app, so this is normally a non-issue; it only bites you testing
`npm start` locally over `http://`, where the browser will silently refuse
to send the cookie back.

## Two scan modes — and why they're different

**Quick scan (`/`, `src/lib/scans.ts`)** — ungrounded. Claude is asked to
answer "the way an AI assistant would," from its own knowledge, no tools.
Cheap and fast, good for a first look, but it can never produce a real
citation URL because it never actually looks anything up. Only tracks
*mentions* (does the brand name appear in the text).

**Bulk scan (`/bulk-scan`, `src/lib/bulk-scan.ts`)** — grounded with Claude's
`web_search` tool (`answerPromptGrounded` in `src/lib/anthropic.ts`), so the
response carries real citation URLs Claude actually used. This is what makes
the *citation* metrics (as opposed to mere name mentions) honest, and it's
the one built for running a real topic/keyword list — CSV import, weekly
reruns, trend/movement. It costs more per prompt (a search round-trip, not
just a completion) and takes longer, by design.

## Large keyword uploads & cost control (Universes only)

A Universe accepts up to ~12,000 raw keywords, not just a hand-curated
topic list — but scanning every keyword with a grounded `web_search` call
would be prohibitively expensive at that scale. So it's a two-step flow:

1. **Categorize (cheap).** Right after upload, `runCategorization()`
   (`src/lib/universe.ts`) samples the highest-volume keywords to propose a
   fixed theme list (`proposeThemes`, `src/lib/anthropic.ts` — always
   includes a "Brand" theme), then classifies every keyword against that
   list in batches (`classifyKeywordsAgainstThemes`). No `web_search` tool,
   no per-keyword call — cost is roughly `sample + total/batch_size`, not
   `total`. Rows that already had a `category` on import are left alone.
2. **Track + run (the expensive step).** The universe page shows every
   theme with its keyword count and total volume — this is free, just a
   `GROUP BY`. You pick which themes matter; `setTrackedThemes()` then
   marks only the top 20 highest-volume keywords *within* each tracked
   theme as `tracked = 1`. `startUniverseRun()` only ever scans that
   bounded set, so a run costs `(tracked themes × 20)` grounded calls
   regardless of whether the universe holds 100 or 10,000 keywords.

**Weekly auto-run** re-runs a universe's currently tracked themes on their
own, without a manual "Run now." It's an in-process scheduler
(`src/lib/scheduler.ts`), started once per server boot via
`src/instrumentation.ts` (`register()` — see Next's [instrumentation
docs](https://nextjs.org/docs/app/guides/instrumentation)); it checks
hourly for universes with `auto_run_enabled` and at least one tracked theme
whose `last_auto_run_at` is 7+ days old (or null). It only ever scans
tracked themes — the same bounded set a manual run would.

## Report definitions (`src/lib/report.ts`)

These are the exact terms the bulk-scan report uses — worth reading before
you interpret a number:

| Term | Definition |
|---|---|
| **Mention** | The brand name appears anywhere in the AI's answer text (plain string match, `src/lib/analyze.ts`) |
| **Citation** | The answer's real citations include a URL whose hostname matches the brand's (or a competitor's) domain — only possible because bulk scans are web-search-grounded |
| **Cited URL** | The specific page that showed up as a citation |
| **Coverage / mention rate / citation rate** | % of topics in the run where that brand was mentioned / cited |
| **Share of citations** | A brand's citations ÷ total citations across brand + all competitors in that run — one AI-visibility number |
| **Leader (per topic)** | Whichever brand had the most citations for that topic (mentions as tiebreak) |
| **Movement** | Percentage-point change in mention/citation rate vs. the *previous* bulk scan for the same brand+domain — meaningless without a repeatable cadence (weekly recommended; see below) |

A competitor only gets citation-level tracking (not just mentions) if you
gave it a domain — see the CSV/competitor format below.

## Running a bulk citation scan

### From the browser (`/bulk-scan`)

1. Brand name + **website** (required — citations are matched against it).
2. Competitors, one per line: `Name, domain` (domain optional, but no
   domain means that competitor only gets mention tracking, not citations).
3. Upload a topics CSV. Required column: `topic`. Optional: `type`,
   `priority_tier`, `volume` (anything else is ignored, so a raw SEMrush/
   keyword-tool export with extra columns works as-is).
4. Submit — you're redirected to `/bulk-scan/[id]`, which polls and fills in
   live as topics complete, then shows the full report once done.

### From the CLI (`scripts/run-bulk-scan.mts`) — better for large lists

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run bulk-scan -- \
  --brand "Nykaa" --domain nykaa.com \
  --competitors "Purplle:purplle.com,Myntra:myntra.com,Amazon.in:amazon.in,Tira:tirabeauty.com,AJIO:ajio.com" \
  --topics scripts/data/nykaa-topics-p0-p1.csv
```

Writes to the same SQLite DB the web app reads, so the run shows up at
`/bulk-scan/[id]` (the id is printed at the end) same as a browser-submitted
one. `scripts/data/nykaa-topics-p0-p1.csv` is the P0+P1 topic list (144
topics, ~83M of 89M total keyword volume) extracted from a SEMrush-based
topic-priority workbook — replace it with your own export in the same
`topic,type,priority_tier,volume` shape.

### Cost/scale notes

Each topic costs: a share of a batched "turn this topic into a shopper
question" call (15 topics per batch) + one grounded `web_search` call. The
API route caps a single run at 500 topics; for more, split into batches (the
CLI script has no such cap, but mind your rate limits). For weekly
tracking, re-run the *same* topic/competitor set on a schedule (a Claude
Code Remote Routine hitting the CLI script, or your own cron against
`POST /api/bulk-scan`) — movement is computed by diffing consecutive runs for
the same brand+domain, so consistency across runs matters more than
frequency.

## Honesty about what this is and isn't

- This does **not** call the real ChatGPT, Perplexity, or Google AI
  Overviews APIs — none of them offer one. It's Claude simulating what a
  well-informed answer engine would say for the same question, which
  correlates with real-world citation behavior but is not identical to it.
  Treat the citation rate as a **directional signal**, not ground truth —
  and say so if you show this to anyone.
- Mention detection is a straightforward name/domain match against the
  response text, not semantic — a paraphrase that never uses the brand name
  won't be caught.
- The site audit only checks what's publicly fetchable without
  authentication; it can't see gated content or JS-rendered pages that
  require a headless browser.

## Getting started locally

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without
`ANTHROPIC_API_KEY` set, the homepage shows a banner and scans are refused
(503) rather than silently failing.

Optional env vars:

- `AEO_MODEL` — Claude model used for prompt generation and simulated
  answers. Defaults to `claude-opus-5`. Use `claude-sonnet-5` for
  meaningfully cheaper scans if Opus-tier depth isn't needed.
- `DATABASE_PATH` — where the SQLite file lives. Defaults to
  `./data/tracker.db`. **Set this to a persistent volume in production** —
  see below.

## Deploying (e.g. Railway)

1. Push this repo, connect it in Railway (auto-detects Next.js via
   Nixpacks — `npm install` → `npm run build` → `npm run start`).
2. Add an **Environment Variable**: `ANTHROPIC_API_KEY`.
3. Add a **Volume**, mount it at e.g. `/data`, and set `DATABASE_PATH` to
   `/data/tracker.db` — otherwise scan history *and accounts* reset on
   every deploy (it's one SQLite file for everything, users included).
4. (Optional) set `AEO_MODEL` if you want a cheaper default.

## Extending

- **More answer engines**: `answerPrompt` currently simulates one generic
  "AI assistant." If you get API access to real ChatGPT/Perplexity
  completions, swap or add providers here and store `results.provider` so
  the UI can break citation rate out per engine.
- **Scheduled re-scans**: there's no built-in cron. Point an external
  scheduler (or a Claude Code Remote Routine) at `POST /api/scan` with the
  same brand/domain/competitors on a weekly cadence to build the trend line
  automatically.
- **Prompt/query discovery as its own view**: `generatePrompts` already
  produces the "what are people asking" list — it's currently only used to
  seed a scan. Surfacing it standalone (without running the full scan) would
  be a small addition to `src/lib/anthropic.ts` + a new route.
