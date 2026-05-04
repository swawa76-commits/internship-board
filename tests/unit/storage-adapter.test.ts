// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    await expect(adapter.read("../../etc/passwd")).rejects.toThrow();
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

describe("selectAdapter", () => {
  it("defaults to LocalFsStorageAdapter when STORAGE_DRIVER is unset", async () => {
    const { selectAdapter } = await import("@/server/adapters/storage");
    const adapter = selectAdapter({} as NodeJS.ProcessEnv, false);
    expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);
  });

  it("returns LocalFsStorageAdapter for STORAGE_DRIVER=local and =local-fs", async () => {
    const { selectAdapter } = await import("@/server/adapters/storage");
    expect(
      selectAdapter(
        { STORAGE_DRIVER: "local" } as unknown as NodeJS.ProcessEnv,
        false,
      ),
    ).toBeInstanceOf(LocalFsStorageAdapter);
    expect(
      selectAdapter(
        { STORAGE_DRIVER: "local-fs" } as unknown as NodeJS.ProcessEnv,
        false,
      ),
    ).toBeInstanceOf(LocalFsStorageAdapter);
  });

  it("returns NoopStorageAdapter for STORAGE_DRIVER=noop", async () => {
    const { selectAdapter } = await import("@/server/adapters/storage");
    expect(
      selectAdapter(
        { STORAGE_DRIVER: "noop" } as unknown as NodeJS.ProcessEnv,
        false,
      ),
    ).toBeInstanceOf(NoopStorageAdapter);
  });

  it("falls back to local with a warning on unknown driver in development", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { selectAdapter } = await import("@/server/adapters/storage");
    const adapter = selectAdapter(
      { STORAGE_DRIVER: "made-up" } as unknown as NodeJS.ProcessEnv,
      false,
    );
    expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws on unknown driver in production", async () => {
    const { selectAdapter } = await import("@/server/adapters/storage");
    expect(() =>
      selectAdapter(
        { STORAGE_DRIVER: "made-up" } as unknown as NodeJS.ProcessEnv,
        true,
      ),
    ).toThrow(/Unknown STORAGE_DRIVER/);
  });
});

describe("S3StorageAdapter", () => {
  const baseEnv = {
    S3_BUCKET: "internship-board-uploads",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "AKIA-test",
    S3_SECRET_ACCESS_KEY: "test-secret",
  } as unknown as NodeJS.ProcessEnv;

  it("constructs successfully when every required env var is present", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const adapter = new S3StorageAdapter(baseEnv);
    expect(adapter.name).toBe("s3");
    expect(adapter.bucket).toBe("internship-board-uploads");
    expect(adapter.endpoint).toBeUndefined();
    expect(adapter.forcePathStyle).toBe(false);
    expect(adapter.signedUrlTtlSeconds).toBe(300);
  });

  it("throws a clear error when any required env var is missing", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    expect(
      () =>
        new S3StorageAdapter({
          S3_BUCKET: "x",
          S3_REGION: "us-east-1",
          // missing S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
        } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/missing required env.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/);
  });

  it("selectAdapter(STORAGE_DRIVER=s3) propagates the missing-env error", async () => {
    const { selectAdapter } = await import("@/server/adapters/storage");
    expect(() =>
      selectAdapter(
        { STORAGE_DRIVER: "s3" } as unknown as NodeJS.ProcessEnv,
        false,
      ),
    ).toThrow(/missing required env/);
  });

  it("propagates S3_ENDPOINT and S3_FORCE_PATH_STYLE for R2", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const adapter = new S3StorageAdapter({
      ...baseEnv,
      S3_REGION: "auto",
      S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      S3_FORCE_PATH_STYLE: "true",
      S3_SIGNED_URL_TTL_SECONDS: "600",
    } as unknown as NodeJS.ProcessEnv);
    expect(adapter.region).toBe("auto");
    expect(adapter.endpoint).toBe("https://acct.r2.cloudflarestorage.com");
    expect(adapter.forcePathStyle).toBe(true);
    expect(adapter.signedUrlTtlSeconds).toBe(600);
  });

  it("put sends PutObjectCommand with the right Bucket/Key/ContentType/Body", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { mockClient } = await import("aws-sdk-client-mock");
    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const adapter = new S3StorageAdapter(baseEnv);
    const bytes = Buffer.from("%PDF-1.4 fake");
    const { storageKey } = await adapter.put({
      prefix: "resumes",
      filename: "cv.pdf",
      contentType: "application/pdf",
      bytes,
    });

    expect(storageKey).toMatch(
      /^resumes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    );
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Bucket).toBe("internship-board-uploads");
    expect(input.Key).toBe(storageKey);
    expect(input.ContentType).toBe("application/pdf");
    expect(input.Body).toBe(bytes);

    s3Mock.restore();
  });

  it("put rejects unsupported content types before sending to S3", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { mockClient } = await import("aws-sdk-client-mock");
    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const adapter = new S3StorageAdapter(baseEnv);
    await expect(
      adapter.put({
        prefix: "resumes",
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        bytes: Buffer.from("nope"),
      }),
    ).rejects.toThrow(/Unsupported resume file type/);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);

    s3Mock.restore();
  });

  it("read returns a redirect to a presigned URL", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { mockClient } = await import("aws-sdk-client-mock");
    const s3Mock = mockClient(S3Client);

    const adapter = new S3StorageAdapter(baseEnv);
    const result = await adapter.read("resumes/abc.pdf");
    expect(result.kind).toBe("redirect");
    if (result.kind === "redirect") {
      expect(result.url).toMatch(/^https:\/\//);
      expect(result.url).toContain("X-Amz-Signature=");
      expect(result.url).toContain("X-Amz-Expires=300");
      expect(result.url).toContain("resumes/abc.pdf");
    }

    s3Mock.restore();
  });

  it("read honors a custom S3_SIGNED_URL_TTL_SECONDS", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { mockClient } = await import("aws-sdk-client-mock");
    const s3Mock = mockClient(S3Client);

    const adapter = new S3StorageAdapter({
      ...baseEnv,
      S3_SIGNED_URL_TTL_SECONDS: "900",
    } as unknown as NodeJS.ProcessEnv);
    const result = await adapter.read("logos/abc.png");
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.url).toContain("X-Amz-Expires=900");

    s3Mock.restore();
  });

  it("delete sends DeleteObjectCommand with the right Bucket/Key", async () => {
    const { S3StorageAdapter } =
      await import("@/server/adapters/storage/s3-adapter");
    const { S3Client, DeleteObjectCommand } =
      await import("@aws-sdk/client-s3");
    const { mockClient } = await import("aws-sdk-client-mock");
    const s3Mock = mockClient(S3Client);
    s3Mock.on(DeleteObjectCommand).resolves({});

    const adapter = new S3StorageAdapter(baseEnv);
    await adapter.delete("resumes/abc.pdf");
    const calls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Bucket).toBe("internship-board-uploads");
    expect(calls[0].args[0].input.Key).toBe("resumes/abc.pdf");

    s3Mock.restore();
  });
});
