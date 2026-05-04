import "server-only";

import { prisma } from "@/lib/db/client";
import type {
  ApplicationStatus,
  CompanyApprovalStatus,
  JobPostingStatus,
} from "@/lib/db/generated/enums";

/**
 * Admin dashboard metrics. Read-only aggregations across the whole
 * platform.
 *
 * Access control: callers MUST pass `adminUserId` and we re-validate
 * against the DB that the row is an active ADMIN. Non-admin callers
 * get a `not_admin` Result — we don't fall back to "anonymous" or
 * leak partial data. The action/route layer (`requireRole("ADMIN")`)
 * is the first defense; this re-check is the second.
 *
 * Filters: every aggregation accepts an optional `programTag` and
 * (where it matters) a `since` cutoff for time windows. The cutoff is
 * computed by the caller and passed in — so the route can be honest
 * about "last 7 / 30 / 90 / all time" while the service stays
 * deterministic and easy to test.
 */

export type AdminMetricsResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_admin" };

export type TimeWindow = "7d" | "30d" | "90d" | "all";

export type AdminMetricsFilters = {
  /** Restrict every aggregation to rows tagged with this program. */
  programTag?: string | null;
  /** Time window for "applications in last X days" cards. */
  applicationsWindow?: TimeWindow;
};

export type OverviewMetrics = {
  totalStudents: number;
  studentsCompleteProfiles: number;
  studentsIncompleteProfiles: number;
  totalCompanies: number;
  approvedCompanies: number;
  pendingCompanies: number;
  suspendedCompanies: number;
  totalJobPostings: number;
  jobPostingsByStatus: Record<JobPostingStatus, number>;
  publishedJobPostings: number;
  /** Currently open = PUBLISHED + APPROVED owner. */
  openJobPostings: number;
  totalApplications: number;
  applicationsLast7Days: number;
  applicationsLast30Days: number;
  applicationsLast90Days: number;
  /** Reflects the requested `applicationsWindow` (defaults to 7d). */
  applicationsInSelectedWindow: number;
  applicationsByStatus: Record<ApplicationStatus, number>;
};

export type FunnelSnapshot = {
  publishedJobPostings: number;
  jobPostingsWithAtLeastOneApplicant: number;
  totalApplications: number;
  inReview: number;
  interviewing: number;
  offer: number;
  rejected: number;
};

export type OperationalAlerts = {
  pendingCompanies: number;
  draftJobPostings: number;
  jobPostingsClosingIn7Days: number;
  jobPostingsZeroApplicantsAfter14Days: number;
};

export type RecentActivityItem = {
  id: string;
  type: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  metadataJson: unknown;
};

export type TopJobPosting = {
  id: string;
  title: string;
  jobSlug: string;
  companyName: string;
  companySlug: string;
  status: JobPostingStatus;
  publishedAt: Date | null;
  applicationCount: number;
  programTag: string | null;
};

export type CompanyParticipationRow = {
  id: string;
  companyName: string;
  slug: string;
  approvalStatus: CompanyApprovalStatus;
  openJobPostings: number;
  totalApplicants: number;
  lastActivityAt: Date | null;
  programTag: string | null;
};

export type AdminDashboard = {
  filters: { programTag: string | null; applicationsWindow: TimeWindow };
  overview: OverviewMetrics;
  funnel: FunnelSnapshot;
  alerts: OperationalAlerts;
  recentActivity: RecentActivityItem[];
  topJobPostings: TopJobPosting[];
  companyParticipation: CompanyParticipationRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY_MS);
}

function windowToDays(w: TimeWindow): number | null {
  switch (w) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      return null;
  }
}

async function ensureAdmin(userId: string): Promise<boolean> {
  const row = await prisma.user.findFirst({
    where: { id: userId, role: "ADMIN", deletedAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

const ALL_JOB_STATUSES: JobPostingStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "CLOSED",
  "ARCHIVED",
];
const ALL_APP_STATUSES: ApplicationStatus[] = [
  "APPLIED",
  "IN_REVIEW",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
];

// ---------- Overview ----------

async function loadOverview(
  filters: AdminMetricsFilters,
): Promise<OverviewMetrics> {
  const tag = filters.programTag ?? undefined;
  const win = filters.applicationsWindow ?? "7d";
  const winDays = windowToDays(win);

  const [
    totalStudents,
    studentsComplete,
    totalCompanies,
    approvedCompanies,
    pendingCompanies,
    suspendedCompanies,
    totalJobPostings,
    jobPostingsByStatusGroup,
    publishedJobPostings,
    openJobPostings,
    totalApplications,
    applicationsLast7,
    applicationsLast30,
    applicationsLast90,
    applicationsInWindow,
    applicationsByStatusGroup,
  ] = await Promise.all([
    prisma.studentProfile.count({
      where: tag ? { programTag: tag } : undefined,
    }),
    prisma.studentProfile.count({
      where: { isProfileComplete: true, ...(tag ? { programTag: tag } : {}) },
    }),
    prisma.companyProfile.count({
      where: { deletedAt: null, ...(tag ? { programTag: tag } : {}) },
    }),
    prisma.companyProfile.count({
      where: {
        deletedAt: null,
        approvalStatus: "APPROVED",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.companyProfile.count({
      where: {
        deletedAt: null,
        approvalStatus: "PENDING",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.companyProfile.count({
      where: {
        deletedAt: null,
        approvalStatus: "SUSPENDED",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.jobPosting.count({
      where: { deletedAt: null, ...(tag ? { programTag: tag } : {}) },
    }),
    prisma.jobPosting.groupBy({
      by: ["status"],
      where: { deletedAt: null, ...(tag ? { programTag: tag } : {}) },
      _count: { _all: true },
    }),
    prisma.jobPosting.count({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.jobPosting.count({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        companyProfile: { approvalStatus: "APPROVED", deletedAt: null },
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.application.count({
      where: tag ? { jobPosting: { programTag: tag } } : undefined,
    }),
    prisma.application.count({
      where: {
        appliedAt: { gte: daysAgo(7) },
        ...(tag ? { jobPosting: { programTag: tag } } : {}),
      },
    }),
    prisma.application.count({
      where: {
        appliedAt: { gte: daysAgo(30) },
        ...(tag ? { jobPosting: { programTag: tag } } : {}),
      },
    }),
    prisma.application.count({
      where: {
        appliedAt: { gte: daysAgo(90) },
        ...(tag ? { jobPosting: { programTag: tag } } : {}),
      },
    }),
    prisma.application.count({
      where: {
        ...(winDays !== null ? { appliedAt: { gte: daysAgo(winDays) } } : {}),
        ...(tag ? { jobPosting: { programTag: tag } } : {}),
      },
    }),
    prisma.application.groupBy({
      by: ["status"],
      where: tag ? { jobPosting: { programTag: tag } } : undefined,
      _count: { _all: true },
    }),
  ]);

  const jobPostingsByStatus = ALL_JOB_STATUSES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<JobPostingStatus, number>,
  );
  for (const row of jobPostingsByStatusGroup) {
    jobPostingsByStatus[row.status] = row._count._all;
  }

  const applicationsByStatus = ALL_APP_STATUSES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<ApplicationStatus, number>,
  );
  for (const row of applicationsByStatusGroup) {
    applicationsByStatus[row.status] = row._count._all;
  }

  return {
    totalStudents,
    studentsCompleteProfiles: studentsComplete,
    studentsIncompleteProfiles: totalStudents - studentsComplete,
    totalCompanies,
    approvedCompanies,
    pendingCompanies,
    suspendedCompanies,
    totalJobPostings,
    jobPostingsByStatus,
    publishedJobPostings,
    openJobPostings,
    totalApplications,
    applicationsLast7Days: applicationsLast7,
    applicationsLast30Days: applicationsLast30,
    applicationsLast90Days: applicationsLast90,
    applicationsInSelectedWindow: applicationsInWindow,
    applicationsByStatus,
  };
}

// ---------- Funnel ----------

async function loadFunnel(
  filters: AdminMetricsFilters,
  overview: OverviewMetrics,
): Promise<FunnelSnapshot> {
  const tag = filters.programTag ?? undefined;
  const postingsWithApplicants = await prisma.jobPosting.count({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(tag ? { programTag: tag } : {}),
      applications: { some: {} },
    },
  });
  return {
    publishedJobPostings: overview.publishedJobPostings,
    jobPostingsWithAtLeastOneApplicant: postingsWithApplicants,
    totalApplications: overview.totalApplications,
    inReview: overview.applicationsByStatus.IN_REVIEW,
    interviewing: overview.applicationsByStatus.INTERVIEWING,
    offer: overview.applicationsByStatus.OFFER,
    rejected: overview.applicationsByStatus.REJECTED,
  };
}

// ---------- Alerts ----------

async function loadAlerts(
  filters: AdminMetricsFilters,
): Promise<OperationalAlerts> {
  const tag = filters.programTag ?? undefined;
  const fourteenDaysAgo = daysAgo(14);
  const sevenDaysFromNow = daysFromNow(7);

  const [pending, drafts, closingSoon, zeroApplicants] = await Promise.all([
    prisma.companyProfile.count({
      where: {
        deletedAt: null,
        approvalStatus: "PENDING",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.jobPosting.count({
      where: {
        deletedAt: null,
        status: "DRAFT",
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.jobPosting.count({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        applicationDeadline: {
          gte: new Date(),
          lte: sevenDaysFromNow,
        },
        ...(tag ? { programTag: tag } : {}),
      },
    }),
    prisma.jobPosting.count({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        publishedAt: { lte: fourteenDaysAgo },
        applications: { none: {} },
        ...(tag ? { programTag: tag } : {}),
      },
    }),
  ]);

  return {
    pendingCompanies: pending,
    draftJobPostings: drafts,
    jobPostingsClosingIn7Days: closingSoon,
    jobPostingsZeroApplicantsAfter14Days: zeroApplicants,
  };
}

// ---------- Recent activity ----------

async function loadRecentActivity(
  filters: AdminMetricsFilters,
): Promise<RecentActivityItem[]> {
  const tag = filters.programTag ?? undefined;
  // No direct programTag relation on ActivityEvent — it's a cross-cut
  // log. When a tag filter is set, just don't filter the feed; the
  // dashboard sections that *can* filter (overview, funnel, etc.)
  // already reflect the program scope.
  void tag;

  const rows = await prisma.activityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      actorUserId: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      metadataJson: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actorUserId: r.actorUserId,
    entityType: r.entityType,
    entityId: r.entityId,
    createdAt: r.createdAt,
    metadataJson: r.metadataJson,
  }));
}

// ---------- Top job postings ----------

async function loadTopJobPostings(
  filters: AdminMetricsFilters,
): Promise<TopJobPosting[]> {
  const tag = filters.programTag ?? undefined;
  const rows = await prisma.jobPosting.findMany({
    where: {
      deletedAt: null,
      ...(tag ? { programTag: tag } : {}),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      programTag: true,
      companyProfile: { select: { companyName: true, slug: true } },
      _count: { select: { applications: true } },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      jobSlug: r.slug,
      companyName: r.companyProfile.companyName,
      companySlug: r.companyProfile.slug,
      status: r.status,
      publishedAt: r.publishedAt,
      applicationCount: r._count.applications,
      programTag: r.programTag,
    }))
    .sort((a, b) => b.applicationCount - a.applicationCount)
    .slice(0, 10);
}

// ---------- Company participation ----------

async function loadCompanyParticipation(
  filters: AdminMetricsFilters,
): Promise<CompanyParticipationRow[]> {
  const tag = filters.programTag ?? undefined;
  const rows = await prisma.companyProfile.findMany({
    where: { deletedAt: null, ...(tag ? { programTag: tag } : {}) },
    select: {
      id: true,
      companyName: true,
      slug: true,
      approvalStatus: true,
      programTag: true,
      updatedAt: true,
      jobPostings: {
        where: {
          deletedAt: null,
          status: "PUBLISHED",
        },
        select: {
          id: true,
          updatedAt: true,
          _count: { select: { applications: true } },
        },
      },
    },
  });

  return rows
    .map((c) => {
      const totalApplicants = c.jobPostings.reduce(
        (sum, j) => sum + j._count.applications,
        0,
      );
      const lastJobUpdate = c.jobPostings.reduce<Date | null>(
        (latest, j) =>
          latest === null || j.updatedAt > latest ? j.updatedAt : latest,
        null,
      );
      const lastActivityAt =
        lastJobUpdate && lastJobUpdate > c.updatedAt
          ? lastJobUpdate
          : c.updatedAt;
      return {
        id: c.id,
        companyName: c.companyName,
        slug: c.slug,
        approvalStatus: c.approvalStatus,
        openJobPostings: c.jobPostings.length,
        totalApplicants,
        lastActivityAt,
        programTag: c.programTag,
      };
    })
    .sort((a, b) => b.totalApplicants - a.totalApplicants);
}

// ---------- Public façade ----------

/**
 * Single entry point for the admin dashboard. Authorizes once and
 * returns every section in one call. The dashboard route is fine
 * with this — there's a per-request DB round trip cost but the
 * volumes are tiny in V1 and the integration test surface is much
 * simpler with a single result shape.
 */
export async function getAdminDashboard(
  adminUserId: string,
  filters: AdminMetricsFilters = {},
): Promise<AdminMetricsResult<AdminDashboard>> {
  if (!(await ensureAdmin(adminUserId))) {
    return { ok: false, reason: "not_admin" };
  }
  const overview = await loadOverview(filters);
  const [funnel, alerts, recentActivity, topJobPostings, companyParticipation] =
    await Promise.all([
      loadFunnel(filters, overview),
      loadAlerts(filters),
      loadRecentActivity(filters),
      loadTopJobPostings(filters),
      loadCompanyParticipation(filters),
    ]);

  return {
    ok: true,
    data: {
      filters: {
        programTag: filters.programTag ?? null,
        applicationsWindow: filters.applicationsWindow ?? "7d",
      },
      overview,
      funnel,
      alerts,
      recentActivity,
      topJobPostings,
      companyParticipation,
    },
  };
}

/**
 * Distinct program tags currently in use across companies and
 * postings. Cheap helper for the dashboard filter dropdown.
 */
export async function listProgramTags(
  adminUserId: string,
): Promise<AdminMetricsResult<string[]>> {
  if (!(await ensureAdmin(adminUserId))) {
    return { ok: false, reason: "not_admin" };
  }
  const [coTags, jobTags] = await Promise.all([
    prisma.companyProfile.findMany({
      where: { deletedAt: null, programTag: { not: null } },
      distinct: ["programTag"],
      select: { programTag: true },
    }),
    prisma.jobPosting.findMany({
      where: { deletedAt: null, programTag: { not: null } },
      distinct: ["programTag"],
      select: { programTag: true },
    }),
  ]);
  const set = new Set<string>();
  for (const r of coTags) if (r.programTag) set.add(r.programTag);
  for (const r of jobTags) if (r.programTag) set.add(r.programTag);
  return { ok: true, data: [...set].sort() };
}
