import "server-only";

import { prisma } from "@/lib/db/client";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";
import {
  companyApprovalChanged,
  dispatchEmail,
} from "@/server/services/email-service";
import {
  pageApplicationsForAdmin,
  pageCompaniesForAdmin,
  pageJobPostingsForAdmin,
  pageStudentsForAdmin,
  softDeleteCompanyProfileById,
  softDeleteJobPostingById,
  softDeleteStudentByUserId,
  listCompaniesForFilterDropdown,
  type AdminApplicationFilters,
  type AdminApplicationRow,
  type AdminCompanyFilters,
  type AdminCompanyRow,
  type AdminJobFilters,
  type AdminJobRow,
  type AdminStudentFilters,
  type AdminStudentRow,
  type Paged,
  type Page,
} from "@/server/repositories/admin-repository";
import {
  listActivityEntityTypes,
  pageActivityForAdmin,
  type ActivityFilters,
  type ActivityRow,
} from "@/server/repositories/activity-repository";

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

  // Notify the company AFTER the transaction commits. We re-read the
  // contact target lazily so a missing email or a soft-deleted user
  // simply skips dispatch — never blocks the approval action.
  const target = await prisma.companyProfile.findUnique({
    where: { id: company.id },
    select: {
      companyName: true,
      contactEmail: true,
      user: { select: { email: true, deletedAt: true } },
    },
  });
  const recipient =
    target?.contactEmail ??
    (target && target.user.deletedAt === null ? target.user.email : null);
  if (recipient) {
    await dispatchEmail(
      companyApprovalChanged({
        to: recipient,
        companyName: target?.companyName ?? "your company",
        newStatus,
      }),
    );
  }

  return { ok: true, from, to: newStatus, noChange: false };
}

/**
 * Re-validates the supplied user id is actually a non-soft-deleted
 * ADMIN. Used by every admin list/mutate method so a misrouted action
 * or stale session can't slip through.
 */
async function ensureAdmin(userId: string): Promise<boolean> {
  const row = await prisma.user.findFirst({
    where: { id: userId, role: "ADMIN", deletedAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

export type AdminListResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_admin" };

export type AdminMutateResult =
  | { ok: true }
  | { ok: false; reason: "not_admin" | "not_found" };

// ---------- Admin list/page operations ----------
//
// These are the **only** sanctioned read paths for the /admin/* tables.
// They wrap the repository with an admin gate.
//
// Visibility rule: admin queries deliberately bypass the public
// visibility rules (no `publicJobPostingVisibilityWhere()`, no
// "APPROVED-only" filter). The repo includes DRAFT/PAUSED/CLOSED/
// ARCHIVED postings, PENDING/SUSPENDED companies, etc. by default —
// the only opt-in filter is `includeDeleted` for soft-deleted rows.

export async function listCompaniesPageForAdmin(
  adminUserId: string,
  filters: AdminCompanyFilters,
  page: Page,
): Promise<AdminListResult<Paged<AdminCompanyRow>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await pageCompaniesForAdmin(filters, page) };
}

export async function listStudentsPageForAdmin(
  adminUserId: string,
  filters: AdminStudentFilters,
  page: Page,
): Promise<AdminListResult<Paged<AdminStudentRow>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await pageStudentsForAdmin(filters, page) };
}

export async function listJobPostingsPageForAdmin(
  adminUserId: string,
  filters: AdminJobFilters,
  page: Page,
): Promise<AdminListResult<Paged<AdminJobRow>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await pageJobPostingsForAdmin(filters, page) };
}

export async function listApplicationsPageForAdmin(
  adminUserId: string,
  filters: AdminApplicationFilters,
  page: Page,
): Promise<AdminListResult<Paged<AdminApplicationRow>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await pageApplicationsForAdmin(filters, page) };
}

export async function listFilterCompaniesForAdmin(
  adminUserId: string,
): Promise<AdminListResult<Array<{ id: string; companyName: string }>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await listCompaniesForFilterDropdown() };
}

// ---------- Activity audit log ----------

export async function listActivityPageForAdmin(
  adminUserId: string,
  filters: ActivityFilters,
  page: Page,
): Promise<AdminListResult<Paged<ActivityRow>>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await pageActivityForAdmin(filters, page) };
}

export async function listActivityEntityTypesForAdmin(
  adminUserId: string,
): Promise<AdminListResult<string[]>> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  return { ok: true, data: await listActivityEntityTypes() };
}

// ---------- Admin destructive actions ----------

export async function softDeleteCompanyAsAdmin(
  adminUserId: string,
  companyProfileId: string,
): Promise<AdminMutateResult> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  const r = await softDeleteCompanyProfileById(companyProfileId);
  if (!r.ok) return { ok: false, reason: "not_found" };
  await prisma.activityEvent.create({
    data: {
      type: "COMPANY_SOFT_DELETED",
      actorUserId: adminUserId,
      entityType: "CompanyProfile",
      entityId: companyProfileId,
    },
  });
  return { ok: true };
}

export async function softDeleteStudentAsAdmin(
  adminUserId: string,
  studentUserId: string,
): Promise<AdminMutateResult> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  const r = await softDeleteStudentByUserId(studentUserId);
  if (!r.ok) return { ok: false, reason: "not_found" };
  await prisma.activityEvent.create({
    data: {
      type: "STUDENT_SOFT_DELETED",
      actorUserId: adminUserId,
      entityType: "User",
      entityId: studentUserId,
    },
  });
  return { ok: true };
}

export async function softDeleteJobPostingAsAdmin(
  adminUserId: string,
  jobPostingId: string,
): Promise<AdminMutateResult> {
  if (!(await ensureAdmin(adminUserId)))
    return { ok: false, reason: "not_admin" };
  const r = await softDeleteJobPostingById(jobPostingId);
  if (!r.ok) return { ok: false, reason: "not_found" };
  await prisma.activityEvent.create({
    data: {
      type: "JOB_POSTING_SOFT_DELETED",
      actorUserId: adminUserId,
      entityType: "JobPosting",
      entityId: jobPostingId,
    },
  });
  return { ok: true };
}

// Note: the legacy unfiltered `listCompaniesForAdmin` (from Task 8)
// was removed in Task 22. Callers now use `listCompaniesPageForAdmin`
// (admin-only, paginated, filterable) above.
