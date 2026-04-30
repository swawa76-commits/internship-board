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
}
