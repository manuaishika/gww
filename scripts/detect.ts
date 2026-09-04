/**
 * Refresh stats_daily, then run the detector engine over the most recent
 * sessions of seed data and populate `events`. Idempotent — dedupe keys mean
 * re-running inserts nothing new.
 *
 *   npm run detect            # last 45 sessions
 *   npm run detect -- 120     # last 120 sessions
 */
import "dotenv/config";
import { detectAll, refreshAllStats } from "../src/lib/detect-run";

async function main() {
  const lookback = Number(process.argv[2]) || 45;

  const statsN = await refreshAllStats();
  console.log(`✓ stats_daily: ${statsN} symbols`);

  const { symbols, events } = await detectAll(lookback);
  console.log(
    `✓ detection: ${events} events across ${symbols} symbols (last ${lookback} sessions)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
