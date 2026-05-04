import "server-only";

import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  PutInput,
  PutResult,
  ReadResult,
  StorageAdapter,
} from "./storage-adapter";
import { assertAllowedContentType, inferExt } from "./storage-keys";

/**
 * S3-compatible production adapter. Selected when `STORAGE_DRIVER=s3`
 * and every required env var is present:
 *
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *
 * Optional:
 *
 *   S3_ENDPOINT             — custom endpoint (Cloudflare R2, MinIO, etc.).
 *                              Omit for AWS S3 to use the SDK's default
 *                              regional endpoint.
 *   S3_FORCE_PATH_STYLE     — "true"/"1" to force path-style URLs. Default
 *                              false. R2's virtual-hosted-style works fine,
 *                              so most R2 setups can leave this unset.
 *   S3_SIGNED_URL_TTL_SECONDS — TTL for presigned GET redirects. Default 300.
 *
 * Reads return `{ kind: "redirect", url }` from a presigned GetObject URL,
 * so the route handlers redirect the browser straight at the bucket. The
 * caller is responsible for permission checks BEFORE calling read().
 */

export const REQUIRED_ENV = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export class S3StorageAdapter implements StorageAdapter {
  readonly name = "s3";

  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string | undefined;
  readonly forcePathStyle: boolean;
  readonly signedUrlTtlSeconds: number;

  private readonly client: S3Client;

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
    this.endpoint = env.S3_ENDPOINT || undefined;
    this.forcePathStyle = parseBool(env.S3_FORCE_PATH_STYLE, false);
    this.signedUrlTtlSeconds = Number.parseInt(
      env.S3_SIGNED_URL_TTL_SECONDS ?? "300",
      10,
    );

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      },
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      ...(this.forcePathStyle ? { forcePathStyle: true } : {}),
    });
  }

  async put({
    prefix,
    filename,
    contentType,
    bytes,
  }: PutInput): Promise<PutResult> {
    assertAllowedContentType(prefix, contentType);
    const id = randomUUID();
    const ext = inferExt(filename, contentType);
    const storageKey = `${prefix}/${id}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
      }),
    );

    return { storageKey };
  }

  async read(storageKey: string): Promise<ReadResult> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
    return { kind: "redirect", url };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no" || v === "") return false;
  return fallback;
}
