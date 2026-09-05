/**
 * Run the ingest tick once, against whatever DATABASE_URL points at.
 *   npm run tick             # poll the union of watched symbols
 *   npm run tick -- RELIANCE AAPL   # just these
 *
 * This is the same code path Vercel Cron hits (src/lib/ingest/tick.ts) —
 * fetches from yahoo-finance2, degrades per-symbol on failure, idempotent.
 */
import "dotenv/config";
import { runTick } from "../src/lib/ingest/tick";

async function main() {
  const only = process.argv.slice(2);
  const result = await runTick(only.length ? { only } : {});

  console.log(`\n✓ tick @ ${result.ranAt}`);
  if (result.skipped) {
    console.log(`  skipped: ${result.skipped}`);
  } else {
    console.log(`  polled ${result.polled} symbols`);
    console.log(`  ${result.quotesUpdated} quotes updated, ${result.barsInserted} new bars`);
    console.log(`  ${result.eventsDetected} new events`);
    if (result.failed.length) {
      console.log(`  ${result.failed.length} failed (kept last-known-good):`);
      for (const f of result.failed) console.log(`    ${f.symbol}: ${f.reason}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
