"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";

const approvalChangeSchema = z.object({
  companyProfileId: z.string().cuid(),
  newStatus: z.enum(["APPROVED", "PENDING", "SUSPENDED"]),
});

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
