"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guards";
import {
  setCompanyApprovalStatus,
  softDeleteCompanyAsAdmin,
  softDeleteJobPostingAsAdmin,
  softDeleteStudentAsAdmin,
} from "@/server/services/admin-service";
import {
  type EmailDiagnosticResult,
  runEmailDiagnostic,
  sanitizeEmailDiagnosticError,
} from "@/server/services/email-service";

const approvalChangeSchema = z.object({
  companyProfileId: z.string().cuid(),
  newStatus: z.enum(["APPROVED", "PENDING", "SUSPENDED"]),
});

const idSchema = z.object({ id: z.string().cuid() });

/**
 * Sole sanctioned client-facing path for changing a company's approval
 * state. Calls `requireRole("ADMIN")` (proxy already gates `/admin`,
 * but actions can fire from anywhere — defense in depth) and delegates
 * to the admin service, which re-verifies the actor in DB.
 */
export async function setCompanyApprovalAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole("ADMIN");

  const parsed = approvalChangeSchema.safeParse({
    companyProfileId: formData.get("companyProfileId"),
    newStatus: formData.get("newStatus"),
  });
  if (!parsed.success) {
    // Don't leak structured details on a malformed admin form post —
    // either it's a bug or it's tampering.
    return;
  }

  await setCompanyApprovalStatus(
    admin.id,
    parsed.data.companyProfileId,
    parsed.data.newStatus,
  );

  revalidatePath("/admin/companies");
  revalidatePath("/admin");

  // Cross-role invalidation: the affected company's surfaces all show
  // approval state. We revalidate `/company` as a layout so the
  // dashboard, profile, and onboarding pages all re-fetch fresh status
  // on the company's next navigation. We don't know which company-user
  // is affected at action time, so we invalidate the layout for the
  // whole protected group; unrelated companies pay only a cheap re-render.
  revalidatePath("/company", "layout");

  // The public job list/detail filters on company status, so an
  // APPROVED → SUSPENDED flip must hide the company's postings (and
  // the reverse must reveal them). Revalidate the public surfaces too.
  revalidatePath("/jobs");
  revalidatePath("/companies", "layout");
  revalidatePath("/", "layout");
}

/**
 * Soft-delete a company. Hides their profile + postings from public
 * surfaces (the visibility predicate excludes deletedAt rows). The
 * service logs an activity event so the audit trail captures it.
 */
export async function softDeleteCompanyAdminAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole("ADMIN");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await softDeleteCompanyAsAdmin(admin.id, parsed.data.id);
  revalidatePath("/admin/companies");
  revalidatePath("/admin");
  revalidatePath("/jobs");
  revalidatePath("/companies", "layout");
}

export async function softDeleteStudentAdminAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole("ADMIN");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await softDeleteStudentAsAdmin(admin.id, parsed.data.id);
  revalidatePath("/admin/students");
  revalidatePath("/admin");
}

export async function softDeleteJobPostingAdminAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole("ADMIN");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await softDeleteJobPostingAsAdmin(admin.id, parsed.data.id);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
  revalidatePath("/jobs");
}

/**
 * Operator email diagnostic. Sends one fixed-subject test message to
 * the current admin's own DB email through the same `dispatchEmail`
 * wrapper production notifications use, so the result reflects the
 * deployed runtime's email configuration (not local env).
 *
 * Safety:
 *  - `requireRole("ADMIN")` gates the action.
 *  - Recipient is re-read from the DB by session userId — never an
 *    arbitrary input. Defense in depth against stale session data.
 *  - Returns a sanitized result; never echoes the raw recipient or any
 *    credential-shaped substring of an adapter error.
 *  - On unexpected throw, returns a structured `ok: false` result so
 *    the UI never shows an error boundary.
 */
export async function runEmailDiagnosticAction(
  _prevState: EmailDiagnosticResult | null,
  _formData: FormData,
): Promise<EmailDiagnosticResult> {
  try {
    const session = await requireRole("ADMIN");

    const dbAdmin = await prisma.user.findFirst({
      where: { id: session.id, role: "ADMIN", deletedAt: null },
      select: { email: true },
    });
    if (!dbAdmin || !dbAdmin.email) {
      return {
        provider: "unknown",
        recipientMasked: "***",
        ok: false,
        error:
          "no active ADMIN row with an email found for the current session",
      };
    }

    return await runEmailDiagnostic({ to: dbAdmin.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      provider: "unknown",
      recipientMasked: "***",
      ok: false,
      error: sanitizeEmailDiagnosticError(message),
    };
  }
}
