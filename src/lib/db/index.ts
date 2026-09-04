import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://watchlist:watchlist@localhost:5432/watchlist";

// Reuse the client across HMR reloads in dev so we don't exhaust connections.
const globalForDb = globalThis as unknown as {
  __watchlistPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__watchlistPg ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    // Neon and most managed Postgres require TLS; local docker does not.
    ssl: connectionString.includes("localhost") ? false : "require",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__watchlistPg = client;
}

export const db = drizzle(client, { schema });
export { schema };
