import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplyCta } from "@/features/public-jobs/apply-cta";
import { getPublicJobPostingBySlugs } from "@/server/services/public-job-search";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companySlug: string; jobSlug: string }>;
}) {
  const { companySlug, jobSlug } = await params;
  const posting = await getPublicJobPostingBySlugs(companySlug, jobSlug);
  if (!posting) return { title: "Posting not found" };
  return {
    title: `${posting.title} · ${posting.companyProfile.companyName}`,
    description: posting.description.slice(0, 160),
  };
}

const TERM_LABEL: Record<
  "SUMMER" | "FALL" | "WINTER" | "SPRING" | "YEAR_ROUND",
  string
> = {
  SUMMER: "Summer",
  FALL: "Fall",
  WINTER: "Winter",
  SPRING: "Spring",
  YEAR_ROUND: "Year-round",
};

const COMP_LABEL: Record<"PAID" | "UNPAID" | "STIPEND", string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  STIPEND: "Stipend",
};

export default async function PublicJobDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; jobSlug: string }>;
}) {
  const { companySlug, jobSlug } = await params;
  const posting = await getPublicJobPostingBySlugs(companySlug, jobSlug);
  // The lookup applies the full visibility rule — anything that's
  // soft-deleted, non-PUBLISHED, or owned by a non-APPROVED company
  // returns null and we 404.
  if (!posting) notFound();

  const company = posting.companyProfile;

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <nav className="mx-auto w-full max-w-5xl text-sm text-muted-foreground">
        <Link href="/jobs" className="hover:text-foreground">
          ← Back to all internships
        </Link>
      </nav>

      <article className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Internship
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {posting.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/companies/${company.slug}`}
                className="font-medium text-foreground hover:underline"
              >
                {company.companyName}
              </Link>
              {company.industry ? <> · {company.industry}</> : null}
              {company.headquarters ? <> · {company.headquarters}</> : null}
            </p>
            <div className="flex flex-wrap gap-2 pt-2 text-xs">
              <Tag>{posting.workplaceType}</Tag>
              {posting.internshipTerm ? (
                <Tag>{TERM_LABEL[posting.internshipTerm]}</Tag>
              ) : null}
              {posting.compensationType ? (
                <Tag>{COMP_LABEL[posting.compensationType]}</Tag>
              ) : null}
              {posting.location ? <Tag>{posting.location}</Tag> : null}
              {posting.duration ? <Tag>{posting.duration}</Tag> : null}
            </div>
          </div>
          <ApplyCta jobId={posting.id} />
        </header>

        {(posting.compensationMin != null ||
          posting.compensationMax != null ||
          posting.startDate ||
          posting.applicationDeadline) && (
          <section className="grid gap-3 rounded-md border border-border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {posting.startDate ? (
              <Detail
                label="Start date"
                value={posting.startDate.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              />
            ) : null}
            {posting.applicationDeadline ? (
              <Detail
                label="Apply by"
                value={posting.applicationDeadline.toLocaleDateString(
                  undefined,
                  {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  },
                )}
              />
            ) : null}
            {posting.compensationMin != null ? (
              <Detail
                label="Min comp"
                value={`$${posting.compensationMin}`}
              />
            ) : null}
            {posting.compensationMax != null ? (
              <Detail
                label="Max comp"
                value={`$${posting.compensationMax}`}
              />
            ) : null}
          </section>
        )}

        <Section title="About the role">
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {posting.description}
          </p>
        </Section>

        {posting.responsibilities ? (
          <Section title="Responsibilities">
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {posting.responsibilities}
            </p>
          </Section>
        ) : null}
        {posting.qualifications ? (
          <Section title="Qualifications">
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {posting.qualifications}
            </p>
          </Section>
        ) : null}

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">About {company.companyName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.shortDescription ?? company.description ?? ""}
          </p>
          <Link
            href={`/companies/${company.slug}`}
            className="mt-3 inline-block text-sm font-medium hover:underline"
          >
            View company profile →
          </Link>
        </section>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-md border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-border bg-background px-2 py-0.5 font-mono">
      {children}
    </span>
  );
}
