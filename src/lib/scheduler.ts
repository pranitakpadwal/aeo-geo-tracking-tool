import { isConfigured } from "./anthropic";
import { listUniversesDueForAutoRun, markAutoRun, startUniverseRun } from "./universe";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — cheap query, and "weekly" doesn't need finer granularity

/**
 * Fires any universe that's opted into weekly auto-run and is due (see
 * listUniversesDueForAutoRun — auto_run_enabled, has tracked themes, and
 * last_auto_run_at is null or 7+ days ago). Only ever scans a universe's
 * *tracked* themes, same cost-controlled path as clicking "Run now" — this
 * never scans an untracked theme on its own.
 *
 * markAutoRun() is called before the scan finishes (right when it's kicked
 * off), not after, so a slow/still-running scan can't cause this to fire
 * the same universe twice on the next hourly check.
 */
export function checkDueAutoRuns(): void {
  if (!isConfigured()) return; // no ANTHROPIC_API_KEY — nothing to do yet

  let due: ReturnType<typeof listUniversesDueForAutoRun>;
  try {
    due = listUniversesDueForAutoRun();
  } catch (err) {
    console.error("Auto-run check failed to query due universes:", err);
    return;
  }

  for (const { id, userId } of due) {
    markAutoRun(id);
    try {
      startUniverseRun(id, undefined, userId);
      console.log(`Auto-run: started weekly scan for universe ${id}`);
    } catch (err) {
      console.error(`Auto-run failed for universe ${id}:`, err);
    }
  }
}

let started = false;

/** Idempotent — safe to call more than once (Next.js can invoke
 * instrumentation's register() more than once in some setups); only the
 * first call actually starts the interval. */
export function startScheduler(): void {
  if (started) return;
  started = true;

  // Catch anything overdue shortly after boot, then keep checking hourly.
  setTimeout(checkDueAutoRuns, 30_000);
  setInterval(checkDueAutoRuns, CHECK_INTERVAL_MS);
}
