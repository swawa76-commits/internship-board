import "server-only";

import type {
  PutInput,
  PutResult,
  ReadResult,
  StorageAdapter,
} from "./storage-adapter";

/**
 * S3 production adapter — skeleton only. Selected when
 * `STORAGE_DRIVER=s3` AND every required env var is present:
 *
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *
 * Construction validates configuration up front. If any required var
 * is missing, the constructor throws with a clear message so the
 * runtime fails loudly instead of silently dropping uploads. The
 * selector turns that into a "fall back to local in development /
 * crash on boot in production" decision.
 *
 * The actual SDK calls (PutObjectCommand, GetObjectCommand, etc.)
 * are deliberately unimplemented — the @aws-sdk/* packages aren't
 * installed and the brief tells us not to fake successful uploads.
 * Each method throws a clear `not implemented` so any accidental
 * production traffic against this skeleton produces a loud failure
 * rather than a silent data-loss bug.
 */

export class S3StorageAdapter implements StorageAdapter {
  readonly name = "s3";

  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Optional signed-URL TTL for read redirects. */
  readonly signedUrlTtlSeconds: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const missing = REQUIRED_ENV.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `S3StorageAdapter is missing required env: ${missing.join(", ")}. ` +
          `Set STORAGE_DRIVER=local for development, or provide all of: ${REQUIRED_ENV.join(", ")}.`,
      );
    }
    this.bucket = env.S3_BUCKET as string;
    this.region = env.S3_REGION as string;
    this.accessKeyId = env.S3_ACCESS_KEY_ID as string;
    this.secretAccessKey = env.S3_SECRET_ACCESS_KEY as string;
    this.signedUrlTtlSeconds = Number.parseInt(
      env.S3_SIGNED_URL_TTL_SECONDS ?? "300",
      10,
    );
  }

  async put(_input: PutInput): Promise<PutResult> {
    throw new Error(
      "S3StorageAdapter.put is not implemented yet. Install @aws-sdk/client-s3 " +
        "and finish wiring before enabling STORAGE_DRIVER=s3 in production.",
    );
  }

  async read(_storageKey: string): Promise<ReadResult> {
    throw new Error(
      "S3StorageAdapter.read is not implemented yet. The intended shape returns " +
        "`{ kind: 'redirect', url }` from a presigned GetObject URL.",
    );
  }

  async delete(_storageKey: string): Promise<void> {
    throw new Error(
      "S3StorageAdapter.delete is not implemented yet. Wire DeleteObjectCommand " +
        "before enabling STORAGE_DRIVER=s3 in production.",
    );
  }
}

export const REQUIRED_ENV = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;
