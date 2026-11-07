import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(here, "src"),
      // `server-only` throws outside a React Server Component bundle; tests are server-side.
      "server-only": path.join(here, "test/server-only-stub.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
