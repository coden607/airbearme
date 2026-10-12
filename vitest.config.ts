import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only — Playwright specs under tests/ and e2e/ are run
    // separately via `npm run test:e2e`.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
