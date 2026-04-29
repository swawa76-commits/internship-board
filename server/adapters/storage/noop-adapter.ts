import { randomUUID } from "node:crypto";

import type {
  PutInput,
  PutResult,
  ReadResult,
  StorageAdapter,
} from "./storage-adapter";

/**
 * In-memory no-op adapter. Lets tests construct a `Storage` without
 * touching the filesystem. `put()` returns a deterministic-looking key
 * but doesn't persist bytes; `read()` echoes back what was last `put`.
 */
export class NoopStorageAdapter implements StorageAdapter {
  readonly name = "noop";

  private store = new Map<
    string,
    { contentType: string; filename: string; bytes: Buffer }
  >();

  async put({ prefix, filename, contentType, bytes }: PutInput): Promise<PutResult> {
    const id = randomUUID();
    const storageKey = `${prefix}/${id}`;
    this.store.set(storageKey, { contentType, filename, bytes });
    return { storageKey };
  }

  async read(storageKey: string): Promise<ReadResult> {
    const entry = this.store.get(storageKey);
    if (!entry) throw new Error(`No such key: ${storageKey}`);
    return {
      kind: "stream",
      contentType: entry.contentType,
      filename: entry.filename,
      bytes: entry.bytes,
    };
  }

  async delete(storageKey: string): Promise<void> {
    this.store.delete(storageKey);
  }
}
