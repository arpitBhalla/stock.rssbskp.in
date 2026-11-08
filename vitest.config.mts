import path from "node:path";
import { defineConfig } from "vitest/config";

// Defaults to the OS user on the local socket, like psql does.
process.env.TEST_DATABASE_URL ??= "postgres://localhost:5432/stock_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // One shared database, so test files must not run concurrently.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://localhost",
    },
  },
});
