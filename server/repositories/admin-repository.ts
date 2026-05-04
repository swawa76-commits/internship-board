import "server-only";

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/lib/db/generated/client";
import type {
  ApplicationStatus,
  CompanyApprovalStatus,
  JobPostingStatus,
} from "@/lib/db/generated/enums";

/**
 * Admin data-access layer. Only used by /server/services/admin-*.
 * Pages and actions never call into here directly — they go through
 * the service layer, which is the only place admin authorization
 * (`ensureAdmin`) lives.
 *
 * Two design rules pinned by Task 16:
 *   - **Admin visibility ≠ public visibility.** These queries
 *     intentionally include DRAFT/PAUSED/CLOSED/ARCHIVED postings,
 *     PENDING/SUSPENDED companies, etc. We never AND in the public
 *     visibility fragment from `visibility-service`.
 *   - **Database-level pagination.** Every list method uses Prisma
 *     `take`/`skip` against the matching `count`. We never load the
 *     full table and slice in memory.
 */

export const ADMIN_PAGE_SIZE = 20;

export type Page = { page: number; pageSize: number };
export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

function offset({ page, pageSize }: Page): number {
  return Math.max(0, (page - 1) * pageSize);
}

function clamp(p: Page): Page {
  return {
    page: Math.max(1, p.page | 0),
    pageSize: Math.max(1, Math.min(100, p.pageSize | 0)),
  };
}

// ---------- Companies ----------

export type AdminCompanyFilters = {
  q?: string;
  approvalStatus?: CompanyApprovalStatus;
  programTag?: string | null;
  /** Admin can opt into seeing soft-deleted rows (off by default). */
  includeDeleted?: boolean;
};

export type AdminCompanyRow = {
  id: string;
  companyName: string;
  slug: string;
  approvalStatus: CompanyApprovalStatus;
  contactEmail: string | null;
  programTag: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  jobPostingCount: number;
};

function buildCompanyWhere(
  filters: AdminCompanyFilters,
): Prisma.CompanyProfileWhereInput {
  const where: Prisma.CompanyProfileWhereInput = {};
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters.programTag) where.programTag = filters.programTag;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function pageCompaniesForAdmin(
  filters: AdminCompanyFilters,
  pageInput: Page,
): Promise<Paged<AdminCompanyRow>> {
  const p = clamp(pageInput);
  const where = buildCompanyWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.companyProfile.findMany({
      where,
      orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
      skip: offset(p),
      take: p.pageSize,
      select: {
        id: true,
        companyName: true,
        slug: true,
        approvalStatus: true,
        contactEmail: true,
        programTag: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: {
          select: {
            jobPostings: { where: { deletedAt: null } },
          },
        },
      },
    }),
    prisma.companyProfile.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      slug: r.slug,
      approvalStatus: r.approvalStatus,
      contactEmail: r.contactEmail,
      programTag: r.programTag,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      jobPostingCount: r._count.jobPostings,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function softDeleteCompanyProfileById(
  companyProfileId: string,
): Promise<{ ok: boolean }> {
  const co = await prisma.companyProfile.findFirst({
    where: { id: companyProfileId, deletedAt: null },
    select: { id: true },
  });
  if (!co) return { ok: false };
  await prisma.companyProfile.update({
    where: { id: co.id },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

// ---------- Students ----------

export type AdminStudentFilters = {
  q?: string;
  programTag?: string | null;
  completeness?: "complete" | "incomplete";
  includeDeleted?: boolean;
};

export type AdminStudentRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  university: string | null;
  major: string | null;
  graduationYear: number | null;
  programTag: string | null;
  isProfileComplete: boolean;
  applicationCount: number;
  createdAt: Date;
  updatedAt: Date;
  userDeletedAt: Date | null;
};

function buildStudentWhere(
  filters: AdminStudentFilters,
): Prisma.StudentProfileWhereInput {
  const where: Prisma.StudentProfileWhereInput = {
    user: filters.includeDeleted
      ? { role: "STUDENT" }
      : { role: "STUDENT", deletedAt: null },
  };
  if (filters.programTag) where.programTag = filters.programTag;
  if (filters.completeness) {
    where.isProfileComplete = filters.completeness === "complete";
  }
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { university: { contains: q, mode: "insensitive" } },
      { major: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function pageStudentsForAdmin(
  filters: AdminStudentFilters,
  pageInput: Page,
): Promise<Paged<AdminStudentRow>> {
  const p = clamp(pageInput);
  const where = buildStudentWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      orderBy: [{ isProfileComplete: "asc" }, { updatedAt: "desc" }],
      skip: offset(p),
      take: p.pageSize,
      select: {
        id: true,
        userId: true,
        fullName: true,
        university: true,
        major: true,
        graduationYear: true,
        programTag: true,
        isProfileComplete: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, deletedAt: true } },
        _count: { select: { applications: true } },
      },
    }),
    prisma.studentProfile.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      fullName: r.fullName,
      email: r.user.email,
      university: r.university,
      major: r.major,
      graduationYear: r.graduationYear,
      programTag: r.programTag,
      isProfileComplete: r.isProfileComplete,
      applicationCount: r._count.applications,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userDeletedAt: r.user.deletedAt,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

/**
 * Soft-delete the student's *user row*. Cascade applies via the
 * partial-unique-index pattern (user.deletedAt blocks the active
 * unique). The profile itself stays around so historical applications
 * still resolve company-side.
 */
export async function softDeleteStudentByUserId(
  userId: string,
): Promise<{ ok: boolean }> {
  const u = await prisma.user.findFirst({
    where: { id: userId, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!u) return { ok: false };
  await prisma.user.update({
    where: { id: u.id },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

// ---------- Job postings ----------

export type AdminJobFilters = {
  q?: string;
  status?: JobPostingStatus;
  companyProfileId?: string;
  programTag?: string | null;
  includeDeleted?: boolean;
};

export type AdminJobRow = {
  id: string;
  title: string;
  jobSlug: string;
  status: JobPostingStatus;
  publishedAt: Date | null;
  applicationDeadline: Date | null;
  programTag: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  applicationCount: number;
  company: {
    id: string;
    companyName: string;
    slug: string;
    approvalStatus: CompanyApprovalStatus;
  };
};

function buildJobWhere(filters: AdminJobFilters): Prisma.JobPostingWhereInput {
  const where: Prisma.JobPostingWhereInput = {};
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.status) where.status = filters.status;
  if (filters.companyProfileId)
    where.companyProfileId = filters.companyProfileId;
  if (filters.programTag) where.programTag = filters.programTag;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { companyProfile: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function pageJobPostingsForAdmin(
  filters: AdminJobFilters,
  pageInput: Page,
): Promise<Paged<AdminJobRow>> {
  const p = clamp(pageInput);
  const where = buildJobWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      skip: offset(p),
      take: p.pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        publishedAt: true,
        applicationDeadline: true,
        programTag: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        companyProfile: {
          select: {
            id: true,
            companyName: true,
            slug: true,
            approvalStatus: true,
          },
        },
        _count: { select: { applications: true } },
      },
    }),
    prisma.jobPosting.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      jobSlug: r.slug,
      status: r.status,
      publishedAt: r.publishedAt,
      applicationDeadline: r.applicationDeadline,
      programTag: r.programTag,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      applicationCount: r._count.applications,
      company: r.companyProfile,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function softDeleteJobPostingById(
  jobPostingId: string,
): Promise<{ ok: boolean }> {
  const j = await prisma.jobPosting.findFirst({
    where: { id: jobPostingId, deletedAt: null },
    select: { id: true },
  });
  if (!j) return { ok: false };
  await prisma.jobPosting.update({
    where: { id: j.id },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

// ---------- Applications ----------

export type AdminApplicationFilters = {
  q?: string;
  status?: ApplicationStatus;
  companyProfileId?: string;
  studentProfileId?: string;
  jobPostingId?: string;
  programTag?: string | null;
};

export type AdminApplicationRow = {
  id: string;
  status: ApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
    status: JobPostingStatus;
    programTag: string | null;
  };
  student: {
    id: string;
    fullName: string;
    email: string;
  };
  company: {
    id: string;
    companyName: string;
    slug: string;
  };
};

function buildApplicationWhere(
  filters: AdminApplicationFilters,
): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.studentProfileId)
    where.studentProfileId = filters.studentProfileId;
  if (filters.jobPostingId) where.jobPostingId = filters.jobPostingId;

  const jobFilter: Prisma.JobPostingWhereInput = {};
  if (filters.companyProfileId)
    jobFilter.companyProfileId = filters.companyProfileId;
  if (filters.programTag) jobFilter.programTag = filters.programTag;
  if (Object.keys(jobFilter).length > 0) where.jobPosting = jobFilter;

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { studentProfile: { fullName: { contains: q, mode: "insensitive" } } },
      {
        studentProfile: {
          user: { email: { contains: q, mode: "insensitive" } },
        },
      },
      { jobPosting: { title: { contains: q, mode: "insensitive" } } },
      {
        jobPosting: {
          companyProfile: {
            companyName: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }
  return where;
}

export async function pageApplicationsForAdmin(
  filters: AdminApplicationFilters,
  pageInput: Page,
): Promise<Paged<AdminApplicationRow>> {
  const p = clamp(pageInput);
  const where = buildApplicationWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: [{ appliedAt: "desc" }],
      skip: offset(p),
      take: p.pageSize,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        updatedAt: true,
        jobPosting: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            programTag: true,
            companyProfile: {
              select: { id: true, companyName: true, slug: true },
            },
          },
        },
        studentProfile: {
          select: {
            id: true,
            fullName: true,
            user: { select: { email: true } },
          },
        },
      },
    }),
    prisma.application.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      appliedAt: r.appliedAt,
      updatedAt: r.updatedAt,
      jobPosting: {
        id: r.jobPosting.id,
        title: r.jobPosting.title,
        jobSlug: r.jobPosting.slug,
        status: r.jobPosting.status,
        programTag: r.jobPosting.programTag,
      },
      student: {
        id: r.studentProfile.id,
        fullName: r.studentProfile.fullName,
        email: r.studentProfile.user.email,
      },
      company: r.jobPosting.companyProfile,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

// ---------- Companies dropdown helper for filters ----------

export async function listCompaniesForFilterDropdown(): Promise<
  Array<{ id: string; companyName: string }>
> {
  return prisma.companyProfile.findMany({
    where: { deletedAt: null },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });
}
