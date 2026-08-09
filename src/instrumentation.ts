// Next.js calls register() once when a new server instance starts (App
// Router convention — see node_modules/next/dist/docs/01-app/02-guides/
// instrumentation.md). Used here to start the weekly-auto-run scheduler so
// it runs for the lifetime of the process, without needing an external
// cron hitting an endpoint. Only meaningful on a persistent Node process
// (e.g. `next start`) — guarded to the nodejs runtime since this touches
// better-sqlite3, which the edge runtime can't load.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
