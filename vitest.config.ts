import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    // Exclude integration tests from the default run, but let the test:rls
    // script opt in by naming an integration file on the command line.
    exclude: [
      ...(process.argv.some((arg) => arg.includes(".integration.test."))
        ? []
        : ["**/*.integration.test.ts"]),
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
