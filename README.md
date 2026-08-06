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

- `/` — new scan form
- `/scan/[id]` — citation rate, share of voice vs named competitors, site
  readiness checklist, and every prompt with its full simulated answer
  (expand to read)
- `/history` — all past scans

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
   `/data/tracker.db` — otherwise scan history resets on every deploy.
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
