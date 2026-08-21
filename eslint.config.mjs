import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "no-console": "error",
    },
  },
  {
    files: [
      "server.mjs",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "playwright.config.ts",
    ],
    rules: { "no-console": "off" },
  },
]);
