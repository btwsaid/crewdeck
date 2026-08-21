import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    coverage: { reporter: ["text", "html"] },
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 15_000,
  },
});
