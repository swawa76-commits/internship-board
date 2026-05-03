import "server-only";

import { LocalFsStorageAdapter } from "./local-fs-adapter";
import { NoopStorageAdapter } from "./noop-adapter";
import { S3StorageAdapter } from "./s3-adapter";
import type { StorageAdapter } from "./storage-adapter";

export type { StorageAdapter, PutInput, PutResult, ReadResult } from "./storage-adapter";
export { LocalFsStorageAdapter, NoopStorageAdapter, S3StorageAdapter };

/**
 * Resolve the active storage adapter from `STORAGE_DRIVER`:
 *
 *   STORAGE_DRIVER=local   → LocalFsStorageAdapter (default)
 *   STORAGE_DRIVER=noop    → NoopStorageAdapter (test seam)
 *   STORAGE_DRIVER=s3      → S3StorageAdapter (production seam)
 *   (unset / unknown)      → LocalFsStorageAdapter, with a warning
 *
 * Production safety: `s3` requires every env var listed in
 * `S3StorageAdapter.REQUIRED_ENV`. If any is missing, construction
 * throws — by design. We do NOT silently fall back to local in that
 * case: a misconfigured production deploy should fail loudly on boot
 * rather than write resumes to an ephemeral container disk.
 *
 * `selectAdapter(env, isProduction)` is a pure function so tests can
 * pin every branch without mutating real `process.env`.
 */
export function selectAdapter(
  env: NodeJS.ProcessEnv = process.env,
  isProduction: boolean = process.env.NODE_ENV === "production",
): StorageAdapter {
  const driver = (env.STORAGE_DRIVER ?? "local-fs").toLowerCase();
  switch (driver) {
    case "noop":
      return new NoopStorageAdapter();
    case "s3":
      return new S3StorageAdapter(env);
    case "local":
    case "local-fs":
      return new LocalFsStorageAdapter();
    default:
      // Unknown driver: in dev, warn and fall back; in production, fail.
      if (isProduction) {
        throw new Error(
          `Unknown STORAGE_DRIVER="${driver}". Set STORAGE_DRIVER to one of: local, s3, noop.`,
        );
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[storage] unknown STORAGE_DRIVER="${driver}", falling back to local-fs adapter`,
      );
      return new LocalFsStorageAdapter();
  }
}

export const storage: StorageAdapter = selectAdapter();
