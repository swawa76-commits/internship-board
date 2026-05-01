import Link from "next/link";

import { FilterBar, type FilterBarValues } from "@/features/public-jobs/filter-bar";
import { JobCard } from "@/features/public-jobs/job-card";
import { getSessionUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import type {
  CompensationType,
  InternshipTerm,
  WorkplaceType,
} from "@/lib/db/generated/enums";
import {
  countPublicJobPostings,
  searchPublicJobPostings,
  type PublicJobFilters,
} from "@/server/services/public-job-search";

export const metadata = {
  title: "Browse internships",
};

const VALID_WORKPLACE = new Set<WorkplaceType>(["REMOTE", "HYBRID", "ONSITE"]);
const VALID_TERM = new Set<InternshipTerm>([
  "SUMMER",
  "FALL",
  "WINTER",
  "SPRING",
  "YEAR_ROUND",
]);
const VALID_COMP = new Set<CompensationType>(["PAID", "UNPAID", "STIPEND"]);

function pickEnum<T>(value: string | undefined, allowed: Set<T>): T | undefined {
  if (!value) return undefined;
  return allowed.has(value as T) ? (value as T) : undefined;
}

function readSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function PublicJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = readSearchParam(params.q).trim();
  const workplaceType = pickEnum(
    readSearchParam(params.workplaceType),
    VALID_WORKPLACE,
  );
  const internshipTerm = pickEnum(
    readSearchParam(params.internshipTerm),
    VALID_TERM,
  );
  const compensationType = pickEnum(
    readSearchParam(params.compensationType),
    VALID_COMP,
  );

  const filters: PublicJobFilters = {
    keyword: q.length > 0 ? q : undefined,
    workplaceType,
    internshipTerm,
    compensationType,
  };

  const [results, total, viewer] = await Promise.all([
    searchPublicJobPostings(filters),
    countPublicJobPostings(filters),
    getSessionUser(),
  ]);

  // Resolve "is this posting saved by me?" in one query for the listed
  // page, rather than N round-trips inside JobCard. Anonymous and non-
  // student viewers get an empty set and the toggle is hidden.
  let savedIds = new Set<string>();
  if (viewer && viewer.role === "STUDENT" && results.length > 0) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    if (profile) {
      const saved = await prisma.savedJobPosting.findMany({
        where: {
          studentProfileId: profile.id,
          jobPostingId: { in: results.map((r) => r.id) },
        },
        select: { jobPostingId: true },
      });
      savedIds = new Set(saved.map((s) => s.jobPostingId));
    }
  }
  const showSaveToggle = Boolean(viewer && viewer.role === "STUDENT");

  const filterValues: FilterBarValues = {
    q,
    workplaceType: workplaceType ?? "",
    internshipTerm: internshipTerm ?? "",
    compensationType: compensationType ?? "",
  };
  const hasAnyFilter =
    filterValues.q.length > 0 ||
    filterValues.workplaceType.length > 0 ||
    filterValues.internshipTerm.length > 0 ||
    filterValues.compensationType.length > 0;

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Browse internships
        </h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "open posting" : "open postings"} from
          approved companies.
        </p>
      </header>

      <section className="mx-auto w-full max-w-5xl">
        <FilterBar values={filterValues} hasAnyFilter={hasAnyFilter} />
      </section>

      <section className="mx-auto w-full max-w-5xl">
        {results.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No postings match {hasAnyFilter ? "those filters" : "the visible set"}.
            </p>
            {hasAnyFilter ? (
              <Link
                href="/jobs"
                className="mt-3 inline-block text-sm font-medium text-foreground hover:underline"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-4">
            {results.map((posting) => (
              <li key={posting.id}>
                <JobCard
                  posting={posting}
                  saveState={
                    showSaveToggle
                      ? { isSaved: savedIds.has(posting.id) }
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
