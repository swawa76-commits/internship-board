/**
 * Storage adapter contract — abstracts where uploaded files actually live
 * so V1 can run on the local filesystem and Task 19 can swap in Vercel
 * Blob / Supabase Storage / S3 without touching call sites.
 *
 * Design rules (CLAUDE.md):
 *  - The DB stores stable storage *keys*, not URLs.
 *  - Read URLs are generated only at read time, after a permission check.
 */

export type PutInput = {
  /** Folder-style key prefix, e.g. "resumes" or "logos". */
  prefix: string;
  /** Original filename (used to derive an extension). */
  filename: string;
  contentType: string;
  bytes: Buffer;
};

export type PutResult = {
  /** Stable opaque string stored in the database. */
  storageKey: string;
};

export type ReadResult =
  | {
      kind: "stream";
      contentType: string;
      filename: string;
      bytes: Buffer;
    }
  | { kind: "redirect"; url: string };

export interface StorageAdapter {
  readonly name: string;
  put(input: PutInput): Promise<PutResult>;
  /**
   * Resolve a storage key to bytes (for local) or a redirect URL (for
   * cloud providers). Caller is responsible for permission checks
   * BEFORE invoking this.
   */
  read(storageKey: string): Promise<ReadResult>;
  delete(storageKey: string): Promise<void>;
}
