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
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key: encoded } = await ctx.params;
  const storageKey = decodeURIComponent(encoded);

  // Defense in depth: even though anyone can hit this route, we only
  // serve from the `logos/` prefix. A malicious URL of
  // `/api/files/logo/resumes%2Fxxx.pdf` should not serve a resume.
  if (!storageKey.startsWith("logos/")) {
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

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
