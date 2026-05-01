import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/guards";
import { storage } from "@/server/adapters/storage";
import { canCompanyReadApplicationSnapshot } from "@/server/services/application-service";

/**
 * Snapshot resume read route. Companies can read the resume that was
 * attached to a specific application (the snapshot key, NOT the
 * student's current resume).
 *
 * Permission policy:
 *  - Caller must be authenticated.
 *  - Caller must be the COMPANY that owns the posting the application
 *    was submitted to. (Admins get broader access in Task 16.)
 *
 * Distinct from the owner-only `/api/files/resume/[key]` route — that
 * one is for the student reading their own LIVE resume on the profile
 * page; this one is for companies reading the SNAPSHOT they were
 * applied with. Different policies, different routes.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await ctx.params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "COMPANY") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const check = await canCompanyReadApplicationSnapshot(
    user.id,
    applicationId,
  );
  if (!check.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!check.storageKey) {
    return NextResponse.json({ error: "no_resume" }, { status: 404 });
  }

  // Defense in depth: only serve from the resumes/ prefix.
  if (!check.storageKey.startsWith("resumes/")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let result;
  try {
    result = await storage.read(check.storageKey);
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
      "Content-Disposition": `inline; filename="${sanitizeFilename(result.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
