import { NextResponse } from "next/server";

import { storage } from "@/server/adapters/storage";

/**
 * Public logo asset route. **No authentication required** — company
 * logos appear on the public company profile, the public job-postings
 * list, and individual posting detail pages, so anyone can fetch them.
 *
 * Cache aggressively: storage keys contain a UUID, so a new logo upload
 * gets a new URL anyway. If a customer rotates their logo we just stop
 * referencing the old key (and the upload action deletes it).
 *
 * This is deliberately separate from the resume read route, which is
 * private and owner-gated. Different policies, different routes — the
 * URL itself tells you which is which.
 *
 * Defense in depth: the route validates the key *shape* itself rather
 * than relying on any one storage adapter to do so. The shape we trust
 * is exactly `logos/<uuid>.<short-extension>`. Anything else is 404.
 * Future cloud adapters can't accidentally widen the surface.
 */

const LOGO_KEY_SHAPE =
  /^logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

const ALLOWED_LOGO_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key: encoded } = await ctx.params;

  let storageKey: string;
  try {
    storageKey = decodeURIComponent(encoded);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Hard reject anything that isn't the exact logos key shape.
  // This blocks:
  //  - resumes/* (different prefix)
  //  - logos/../anything (the regex doesn't allow `.`)
  //  - logos/<not-a-uuid>
  //  - logos/<uuid>.<unsafe-ext>
  //  - keys with embedded path separators or null bytes
  if (!LOGO_KEY_SHAPE.test(storageKey)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let result;
  try {
    result = await storage.read(storageKey);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (result.kind === "redirect") {
    return NextResponse.redirect(result.url);
  }

  // Belt-and-braces content-type check: even though the key shape
  // already constrains the file extension, we refuse to serve anything
  // the storage layer didn't classify as an image type.
  if (!ALLOWED_LOGO_CONTENT_TYPES.has(result.contentType)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
