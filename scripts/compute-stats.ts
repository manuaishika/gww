/**
 * Populate stats_daily for every active symbol from the bars already in the DB.
 *   npm run compute-stats
 */
import "dotenv/config";
import { refreshAllStats } from "../src/lib/detect-run";

async function main() {
  const n = await refreshAllStats();
  console.log(`✓ stats_daily refreshed for ${n} symbols`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
