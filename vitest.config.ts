import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Run test files sequentially. Integration tests share a single
    // Neon database; parallel file execution exhausts the connection
    // pool on the free tier and trips spurious 5s timeouts. Sequential
    // execution is slower but reliable.
    fileParallelism: false,
    testTimeout: 15_000,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".next/**",
      "lib/db/generated/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
