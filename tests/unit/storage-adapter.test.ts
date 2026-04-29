// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalFsStorageAdapter } from "@/server/adapters/storage/local-fs-adapter";
import { NoopStorageAdapter } from "@/server/adapters/storage/noop-adapter";

let originalCwd: string;
let tmpRoot: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "storage-test-"));
  // The local adapter writes under cwd/storage-uploads — point cwd at a
  // throwaway temp dir so the test doesn't pollute the repo.
  process.chdir(tmpRoot);
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("LocalFsStorageAdapter", () => {
  it("writes a resume to disk and reads it back", async () => {
    const adapter = new LocalFsStorageAdapter();
    const bytes = Buffer.from("%PDF-1.4 fake pdf body");
    const { storageKey } = await adapter.put({
      prefix: "resumes",
      filename: "my-cv.pdf",
      contentType: "application/pdf",
      bytes,
    });
    expect(storageKey.startsWith("resumes/")).toBe(true);
    expect(storageKey.endsWith(".pdf")).toBe(true);

    const result = await adapter.read(storageKey);
    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(result.bytes.equals(bytes)).toBe(true);
      expect(result.contentType).toBe("application/pdf");
    }
  });

  it("rejects unsupported resume content types", async () => {
    const adapter = new LocalFsStorageAdapter();
    await expect(
      adapter.put({
        prefix: "resumes",
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        bytes: Buffer.from("nope"),
      }),
    ).rejects.toThrow(/Unsupported resume file type/);
  });

  it("delete is idempotent", async () => {
    const adapter = new LocalFsStorageAdapter();
    const { storageKey } = await adapter.put({
      prefix: "resumes",
      filename: "cv.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("data"),
    });
    await adapter.delete(storageKey);
    // Second delete should not throw.
    await expect(adapter.delete(storageKey)).resolves.toBeUndefined();
  });

  it("rejects path traversal in storage keys", async () => {
    const adapter = new LocalFsStorageAdapter();
    await expect(
      adapter.read("../../etc/passwd"),
    ).rejects.toThrow();
  });

  it("partitions files into the requested prefix folder", async () => {
    const adapter = new LocalFsStorageAdapter();
    await adapter.put({
      prefix: "resumes",
      filename: "a.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("a"),
    });
    await adapter.put({
      prefix: "logos",
      filename: "b.png",
      contentType: "image/png",
      bytes: Buffer.from("b"),
    });
    const root = path.join(process.cwd(), "storage-uploads");
    const dirs = await readdir(root);
    expect(dirs).toContain("resumes");
    expect(dirs).toContain("logos");
  });
});

describe("NoopStorageAdapter", () => {
  it("round-trips put → read in memory", async () => {
    const adapter = new NoopStorageAdapter();
    const { storageKey } = await adapter.put({
      prefix: "resumes",
      filename: "cv.pdf",
      contentType: "application/pdf",
      bytes: Buffer.from("hello"),
    });
    const result = await adapter.read(storageKey);
    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(result.bytes.toString()).toBe("hello");
    }
  });
});
