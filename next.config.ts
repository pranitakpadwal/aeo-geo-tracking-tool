import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 ships a native .node binary that can't be bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
