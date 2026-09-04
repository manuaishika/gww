import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 is only imported in server code (ingest path). Keep it external
  // so it is not bundled into route handlers.
  serverExternalPackages: ["yahoo-finance2", "postgres"],
};

export default nextConfig;
