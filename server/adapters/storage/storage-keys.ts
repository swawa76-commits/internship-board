import "server-only";

import path from "node:path";

/**
 * Shared content-type allowlists and key-shape helpers used by every
 * storage adapter. Centralized so the local adapter and the S3/R2
 * adapter validate uploads identically — without this, the production
 * path could accept files the local adapter would reject.
 *
 * Key shape produced by `buildStorageKey` is `<prefix>/<uuid>.<ext>`,
 * which the public logo route's regex relies on. Do not change without
 * also updating `app/api/files/logo/[key]/route.ts`.
 */

const SAFE_EXT = /^[a-z0-9]{1,8}$/i;

export const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export function assertAllowedContentType(
  prefix: string,
  contentType: string,
): void {
  if (prefix === "resumes" && !ALLOWED_RESUME_TYPES.has(contentType)) {
    throw new Error("Unsupported resume file type. Use PDF, DOC, or DOCX.");
  }
  if (prefix === "logos" && !ALLOWED_LOGO_TYPES.has(contentType)) {
    throw new Error("Unsupported logo file type. Use PNG, JPG, WebP, or SVG.");
  }
}

export function inferExt(filename: string, contentType: string): string {
  const fromName = path.extname(filename).replace(/^\./, "").toLowerCase();
  if (SAFE_EXT.test(fromName)) return fromName;
  if (contentType === "application/pdf") return "pdf";
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (contentType === "application/msword") return "doc";
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/svg+xml") return "svg";
  return "bin";
}

export function extToContentType(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
