import "server-only";

import { prisma } from "@/lib/db/client";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

/**
 * Fetch the *current* company approval status straight from the database
 * for the given company-owner user. Never rely on session/JWT for this —
 * an admin could approve or suspend the company at any moment.
 *
 * Returns null if the user has no associated (non-deleted) company profile.
 */
export async function getFreshCompanyApprovalStatus(
  userId: string,
): Promise<CompanyApprovalStatus | null> {
  const company = await prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { approvalStatus: true },
  });
  return company?.approvalStatus ?? null;
}
