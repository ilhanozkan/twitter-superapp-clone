import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // The Studio's schema files import `sanity`, which only sanity/
      // installs: tests that read them get a stub of its define helpers.
      {
        find: /^sanity$/,
        replacement: fileURLToPath(
          new URL("./test/sanityStub.ts", import.meta.url)
        ),
      },
    ],
  },
  test: {
    environment: "node",
    // Dates are formatted in local time: pin it so results match everywhere.
    env: { TZ: "UTC" },
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "sanity/**", "e2e/**"],
  },
});
