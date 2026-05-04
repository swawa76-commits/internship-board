// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * Real-bucket round-trip against Cloudflare R2 (or any S3-compatible
 * endpoint). Skipped by default — only runs when every gate env var is
 * set, so CI and local runs without R2 credentials never touch the
 * network.
 *
 * To run locally:
 *   R2_TEST_BUCKET=... R2_TEST_REGION=auto \
 *   R2_TEST_ENDPOINT=https://<acct>.r2.cloudflarestorage.com \
 *   R2_TEST_ACCESS_KEY_ID=... R2_TEST_SECRET_ACCESS_KEY=... \
 *   npm run test:integration -- r2-storage
 */

const GATE_VARS = [
  "R2_TEST_BUCKET",
  "R2_TEST_REGION",
  "R2_TEST_ENDPOINT",
  "R2_TEST_ACCESS_KEY_ID",
  "R2_TEST_SECRET_ACCESS_KEY",
] as const;

const enabled = GATE_VARS.every((k) => !!process.env[k]);

describe.skipIf(!enabled)("S3StorageAdapter ⇄ R2 (live)", () => {
  it("puts, reads, and deletes a real object", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const adapter = new S3StorageAdapter({
      S3_BUCKET: process.env.R2_TEST_BUCKET,
      S3_REGION: process.env.R2_TEST_REGION,
      S3_ENDPOINT: process.env.R2_TEST_ENDPOINT,
      S3_ACCESS_KEY_ID: process.env.R2_TEST_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.R2_TEST_SECRET_ACCESS_KEY,
      S3_SIGNED_URL_TTL_SECONDS: "60",
    } as unknown as NodeJS.ProcessEnv);

    const bytes = Buffer.from("%PDF-1.4 r2 round-trip");
    const { storageKey } = await adapter.put({
      prefix: "resumes",
      filename: "round-trip.pdf",
      contentType: "application/pdf",
      bytes,
    });

    try {
      const read = await adapter.read(storageKey);
      expect(read.kind).toBe("redirect");
      if (read.kind === "redirect") {
        const res = await fetch(read.url);
        expect(res.ok).toBe(true);
        const body = Buffer.from(await res.arrayBuffer());
        expect(body.equals(bytes)).toBe(true);
      }
    } finally {
      await adapter.delete(storageKey);
    }
  }, 30_000);
});
