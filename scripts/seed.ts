/**
 * Phase 0 seed: the symbol universe only.
 * Phase 1 adds committed daily bars + a synthetic quote per symbol so the app
 * has data from a clean clone with no API keys.
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { symbols } from "../src/lib/db/schema";
import { SEED_SYMBOLS, NIFTY_SYMBOL } from "../src/lib/seed-data";

const url =
  process.env.DATABASE_URL ??
  "postgres://watchlist:watchlist@localhost:5432/watchlist";

async function main() {
  const client = postgres(url, {
    max: 1,
    ssl: url.includes("localhost") ? false : "require",
  });
  const db = drizzle(client);

  const rows = [
    {
      symbol: NIFTY_SYMBOL,
      name: "NIFTY 50",
      exchange: "NSE",
      sector: "Index",
      listedOn: "1996-04-22",
      isActive: true,
    },
    ...SEED_SYMBOLS.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      exchange: "NSE",
      sector: s.sector,
      listedOn: s.listedOn,
      isActive: true,
    })),
  ];

  await db
    .insert(symbols)
    .values(rows)
    .onConflictDoUpdate({
      target: symbols.symbol,
      set: {
        name: sql`excluded.name`,
        sector: sql`excluded.sector`,
      },
    });

  console.log(
    `✓ seeded ${rows.length} symbols (${SEED_SYMBOLS.length} equities + index)`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
