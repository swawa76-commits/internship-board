import "server-only";

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/lib/db/generated/client";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

/**
 * Single source of truth for "is this company allowed to have publicly
 * visible job postings?".
 *
 * Used by:
 *   - Task 9 (job posting CRUD): publish action refuses to flip a row
 *     to PUBLISHED unless this returns true.
 *   - Task 10 (public list / detail): filter postings via the `where`
 *     fragment below.
 *   - Task 15 (admin metrics): same `where` for "currently public" KPIs.
 *
 * Never inline the rule "approvalStatus === APPROVED" anywhere else —
 * change it here, change it everywhere.
 */

/** Pure predicate. No DB. */
export function canCompanyPublishJobsByStatus(
  status: CompanyApprovalStatus,
): boolean {
  return status === "APPROVED";
}

/**
 * DB-backed: read the company's *current* approval status fresh and
 * apply the predicate. Returns false for missing or soft-deleted
 * companies.
 */
export async function canCompanyPublishJobs(
  companyProfileId: string,
): Promise<boolean> {
  const row = await prisma.companyProfile.findFirst({
    where: { id: companyProfileId, deletedAt: null },
    select: { approvalStatus: true },
  });
  if (!row) return false;
  return canCompanyPublishJobsByStatus(row.approvalStatus);
}

/** Convenience for the common "I have the user, not the company" case. */
export async function canCompanyPublishJobsByUserId(
  userId: string,
): Promise<boolean> {
  const row = await prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { approvalStatus: true },
  });
  if (!row) return false;
  return canCompanyPublishJobsByStatus(row.approvalStatus);
}

/**
 * Prisma `where` fragment to AND into any public-facing job posting
 * query. A posting is publicly visible when:
 *   - the posting itself isn't soft-deleted
 *   - its status is PUBLISHED
 *   - the owning company is APPROVED and not soft-deleted
 *
 * This deliberately doesn't filter by `applicationDeadline` — that's a
 * Task 10 concern (a closed-deadline posting may still need to display
 * its details to applicants who applied before close).
 */
export function publicJobPostingVisibilityWhere(): Prisma.JobPostingWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    companyProfile: {
      approvalStatus: "APPROVED",
      deletedAt: null,
    },
  };
}
