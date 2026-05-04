import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  PutInput,
  PutResult,
  ReadResult,
  StorageAdapter,
} from "./storage-adapter";
import {
  assertAllowedContentType,
  extToContentType,
  inferExt,
} from "./storage-keys";

/**
 * Local-filesystem adapter. Writes uploads under `./storage-uploads/...`
 * (gitignored). Suitable for local development; production swaps in
 * Vercel Blob or Supabase Storage in Task 19.
 *
 * Keys are content-addressable-ish: `<prefix>/<uuid>.<ext>`. The UUID
 * keeps two students' "resume.pdf" from colliding.
 */

function rootDir(): string {
  return path.resolve(process.cwd(), "storage-uploads");
}

function safeJoin(prefix: string, key: string): string {
  // Basic traversal guard — keys generated here only contain a UUID + ext,
  // but we still join + verify the final path stays inside the root.
  const root = rootDir();
  const joined = path.resolve(root, prefix, key);
  if (!joined.startsWith(root + path.sep) && joined !== root) {
    throw new Error("Invalid storage key");
  }
  return joined;
}

export class LocalFsStorageAdapter implements StorageAdapter {
  readonly name = "local-fs";

  async put({
    prefix,
    filename,
    contentType,
    bytes,
  }: PutInput): Promise<PutResult> {
    assertAllowedContentType(prefix, contentType);
    const id = randomUUID();
    const ext = inferExt(filename, contentType);
    const relativeKey = `${prefix}/${id}.${ext}`;
    const fullPath = safeJoin(prefix, `${id}.${ext}`);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
    return { storageKey: relativeKey };
  }

  async read(storageKey: string): Promise<ReadResult> {
    const [prefix, file] = storageKey.split("/", 2);
    if (!prefix || !file) throw new Error("Invalid storage key");
    const fullPath = safeJoin(prefix, file);
    const bytes = await readFile(fullPath);
    const ext = path.extname(file).replace(/^\./, "").toLowerCase();
    const contentType = extToContentType(ext);
    return {
      kind: "stream",
      contentType,
      filename: file,
      bytes,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const [prefix, file] = storageKey.split("/", 2);
    if (!prefix || !file) return;
    const fullPath = safeJoin(prefix, file);
    try {
      await unlink(fullPath);
    } catch (err: unknown) {
      // Tolerate "not found" — caller may be retrying after a partial delete.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "ENOENT"
      ) {
        return;
      }
      throw err;
    }
  }
}
