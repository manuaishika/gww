/**
 * One command for a reviewer: `npm run setup`.
 *   1. start Postgres (docker compose)
 *   2. wait for it to be healthy
 *   3. run migrations
 *   4. seed
 *
 * No API keys. If Docker isn't running, it says so and points at DATABASE_URL.
 */
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

const quiet = (cmd) =>
  execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] })
    .toString()
    .trim();

async function main() {
  const usingExternalDb =
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost");

  if (usingExternalDb) {
    console.log("→ DATABASE_URL points at a remote database; skipping docker compose.");
  } else {
    try {
      quiet("docker info");
    } catch {
      console.error(
        "\n✗ Docker doesn't appear to be running.\n" +
          "  Start Docker Desktop, or set DATABASE_URL to any Postgres 16 instance\n" +
          "  (e.g. a free Neon database) and re-run `npm run setup`.\n",
      );
      process.exit(1);
    }

    run("docker compose up -d");

    process.stdout.write("→ waiting for Postgres to be healthy");
    const deadline = Date.now() + 90_000;
    let healthy = false;
    while (Date.now() < deadline) {
      try {
        const cid = quiet("docker compose ps -q db");
        const status = quiet(
          `docker inspect --format "{{.State.Health.Status}}" ${cid}`,
        );
        if (status === "healthy") {
          healthy = true;
          break;
        }
      } catch {
        // container not up yet
      }
      process.stdout.write(".");
      await sleep(2000);
    }
    process.stdout.write("\n");
    if (!healthy) {
      console.error("✗ Postgres did not become healthy in 90s. Check `docker compose logs db`.");
      process.exit(1);
    }
    console.log("  Postgres is healthy.");
  }

  run("npm run db:migrate");
  run("npm run seed");

  console.log(
    "\n✓ Setup complete.\n  Next:  npm run dev   →   http://localhost:3000\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
