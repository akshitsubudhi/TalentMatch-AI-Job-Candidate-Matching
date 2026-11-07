import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // The core package ships TypeScript source.
  transpilePackages: ["@talentmatch/core"],
  outputFileTracingRoot: path.join(here, "../.."),
  poweredByHeader: false,
  // ESLint runs once for the whole monorepo (`pnpm lint` at the root, and in CI).
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
