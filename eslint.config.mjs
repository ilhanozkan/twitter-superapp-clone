import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const config = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Tests read arbitrary JSON response bodies.
    files: ["**/*.test.ts", "**/*.test.tsx", "test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "sanity/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
