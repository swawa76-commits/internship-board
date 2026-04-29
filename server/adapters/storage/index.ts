import "server-only";

import { LocalFsStorageAdapter } from "./local-fs-adapter";
import { NoopStorageAdapter } from "./noop-adapter";
import type { StorageAdapter } from "./storage-adapter";

export type { StorageAdapter, PutInput, PutResult, ReadResult } from "./storage-adapter";
export { LocalFsStorageAdapter, NoopStorageAdapter };

/**
 * Resolve the active storage adapter based on `STORAGE_DRIVER`.
 * Defaults to local-fs in development. Task 19 will add a Vercel Blob
 * adapter behind the same interface.
 */
function selectAdapter(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "local-fs").toLowerCase();
  switch (driver) {
    case "noop":
      return new NoopStorageAdapter();
    case "local-fs":
    default:
      return new LocalFsStorageAdapter();
  }
}

export const storage: StorageAdapter = selectAdapter();
