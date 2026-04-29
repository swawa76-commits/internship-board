import "dotenv/config";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Only run RTL cleanup when we're in a DOM environment (jsdom).
// Integration tests under tests/integration/ use the `node` environment.
afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});
