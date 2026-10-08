import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Dates are formatted in local time: pin it so results match everywhere.
    env: { TZ: "UTC" },
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "sanity/**", "e2e/**"],
  },
});
