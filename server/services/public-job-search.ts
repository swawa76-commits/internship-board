import "server-only";

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/lib/db/generated/client";
import type {
  CompensationType,
  InternshipTerm,
  WorkplaceType,
} from "@/lib/db/generated/enums";
import { publicJobPostingVisibilityWhere } from "@/server/services/visibility-service";

/**
 * Public job-posting search + filters. The visibility rule comes from
 * `publicJobPostingVisibilityWhere()` (Task 8) — never inline that
 * rule here, just AND extra filters on top.
 *
 * `keyword` does a simple case-insensitive contains match against
 * title + description. Postgres ILIKE is fast enough at V1 scale; if
 * we ever outgrow it we'll layer on `pg_trgm` or move to a search
 * service. CLAUDE.md explicitly forbids Elasticsearch in V1.
 */

export type PublicJobFilters = {
  keyword?: string;
  workplaceType?: WorkplaceType;
  internshipTerm?: InternshipTerm;
  compensationType?: CompensationType;
};

export type PublicJobListItem = {
  id: string;
  jobSlug: string;
  title: string;
  workplaceType: WorkplaceType;
  internshipTerm: InternshipTerm | null;
  compensationType: CompensationType | null;
  shortDescription: string;
  publishedAt: Date | null;
  company: {
    companyName: string;
    companySlug: string;
    logoStorageKey: string | null;
    industry: string | null;
    headquarters: string | null;
  };
};

const MAX_KEYWORD_LEN = 120;

function buildWhere(filters: PublicJobFilters): Prisma.JobPostingWhereInput {
  const base = publicJobPostingVisibilityWhere();
  const extra: Prisma.JobPostingWhereInput[] = [];

  if (filters.workplaceType) {
    extra.push({ workplaceType: filters.workplaceType });
  }
  if (filters.internshipTerm) {
    extra.push({ internshipTerm: filters.internshipTerm });
  }
  if (filters.compensationType) {
    extra.push({ compensationType: filters.compensationType });
  }
  if (filters.keyword && filters.keyword.trim().length > 0) {
    const k = filters.keyword.trim().slice(0, MAX_KEYWORD_LEN);
    extra.push({
      OR: [
        { title: { contains: k, mode: "insensitive" } },
        { description: { contains: k, mode: "insensitive" } },
      ],
    });
  }

  if (extra.length === 0) return base;
  return { AND: [base, ...extra] };
}

export async function searchPublicJobPostings(
  filters: PublicJobFilters,
  pagination?: { skip?: number; take?: number },
): Promise<PublicJobListItem[]> {
  const where = buildWhere(filters);
  const rows = await prisma.jobPosting.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    skip: pagination?.skip,
    take: pagination?.take ?? 50,
    select: {
      id: true,
      slug: true,
      title: true,
      workplaceType: true,
      internshipTerm: true,
      compensationType: true,
      description: true,
      publishedAt: true,
      companyProfile: {
        select: {
          companyName: true,
          slug: true,
          logoStorageKey: true,
          industry: true,
          headquarters: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    jobSlug: r.slug,
    title: r.title,
    workplaceType: r.workplaceType,
    internshipTerm: r.internshipTerm,
    compensationType: r.compensationType,
    // Listing-card preview — first ~200 chars of the description with
    // newlines collapsed. The detail page renders the full body.
    shortDescription: r.description.replace(/\s+/g, " ").slice(0, 200),
    publishedAt: r.publishedAt,
    company: {
      companyName: r.companyProfile.companyName,
      companySlug: r.companyProfile.slug,
      logoStorageKey: r.companyProfile.logoStorageKey,
      industry: r.companyProfile.industry,
      headquarters: r.companyProfile.headquarters,
    },
  }));
}

export async function countPublicJobPostings(
  filters: PublicJobFilters,
): Promise<number> {
  return prisma.jobPosting.count({ where: buildWhere(filters) });
}

/**
 * Resolve a single public job posting by `(companySlug, jobSlug)`.
 * Returns null for any case the public surface should treat as 404:
 *   - missing
 *   - soft-deleted posting or company
 *   - non-PUBLISHED posting
 *   - non-APPROVED owning company
 *
 * The visibility rule is the SAME fragment used by the list query.
 */
export async function getPublicJobPostingBySlugs(
  companySlug: string,
  jobSlug: string,
) {
  const where = buildWhere({});
  return prisma.jobPosting.findFirst({
    where: {
      ...where,
      slug: jobSlug,
      companyProfile: {
        // Merge with the visibility predicate's company filter — Prisma
        // composes nested filters with AND semantics.
        ...(where as { companyProfile?: object }).companyProfile,
        slug: companySlug,
      },
    },
    include: {
      companyProfile: {
        select: {
          companyName: true,
          slug: true,
          logoStorageKey: true,
          industry: true,
          companySize: true,
          headquarters: true,
          shortDescription: true,
          description: true,
          websiteUrl: true,
        },
      },
    },
  });
}

/**
 * Visibility-bypass lookup. Returns the posting regardless of whether
 * it's currently publicly visible — caller is responsible for having
 * already authorized the bypass (e.g., the requesting user is a
 * student with an active application). Excludes only soft-deleted
 * rows so a hard delete can't leak.
 *
 * The detail page uses this together with `studentHasActiveApplication`
 * from application-service.
 */
export async function getJobPostingBySlugsForBypass(
  companySlug: string,
  jobSlug: string,
) {
  return prisma.jobPosting.findFirst({
    where: {
      slug: jobSlug,
      deletedAt: null,
      companyProfile: { slug: companySlug, deletedAt: null },
    },
    include: {
      companyProfile: {
        select: {
          companyName: true,
          slug: true,
          logoStorageKey: true,
          industry: true,
          companySize: true,
          headquarters: true,
          shortDescription: true,
          description: true,
          websiteUrl: true,
        },
      },
    },
  });
}

/**
 * Resolve a public company by slug, including the company's currently
 * visible postings. Used by /companies/[companySlug] (a Task 10
 * scaffold; the full body lands later — but the route shape is needed
 * now so the breadcrumb on the job detail page links somewhere).
 */
export async function getPublicCompanyBySlug(companySlug: string) {
  return prisma.companyProfile.findFirst({
    where: {
      slug: companySlug,
      approvalStatus: "APPROVED",
      deletedAt: null,
    },
    include: {
      jobPostings: {
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          workplaceType: true,
          internshipTerm: true,
          publishedAt: true,
        },
      },
    },
  });
}
