import Link from "next/link";

import type { PublicJobListItem } from "@/server/services/public-job-search";

const TERM_LABEL: Record<NonNullable<PublicJobListItem["internshipTerm"]>, string> = {
  SUMMER: "Summer",
  FALL: "Fall",
  WINTER: "Winter",
  SPRING: "Spring",
  YEAR_ROUND: "Year-round",
};

export function JobCard({ posting }: { posting: PublicJobListItem }) {
  const href = `/companies/${posting.company.companySlug}/jobs/${posting.jobSlug}`;
  return (
    <article className="rounded-md border border-border bg-card p-5 transition-colors hover:bg-accent/40">
      <div className="flex items-start gap-4">
        {posting.company.logoStorageKey ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/files/logo/${encodeURIComponent(posting.company.logoStorageKey)}`}
            alt=""
            className="size-12 rounded-md border border-border bg-muted object-contain"
          />
        ) : (
          <div className="size-12 rounded-md border border-border bg-muted" />
        )}
        <div className="flex-1 space-y-1">
          <h2 className="text-lg font-semibold">
            <Link href={href} className="hover:underline">
              {posting.title}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            {posting.company.companyName}
            {posting.company.industry ? <> · {posting.company.industry}</> : null}
            {posting.company.headquarters ? <> · {posting.company.headquarters}</> : null}
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <Badge>{posting.workplaceType}</Badge>
            {posting.internshipTerm ? (
              <Badge>{TERM_LABEL[posting.internshipTerm]}</Badge>
            ) : null}
            {posting.compensationType ? (
              <Badge>{posting.compensationType}</Badge>
            ) : null}
          </div>
          <p className="line-clamp-2 pt-2 text-sm text-muted-foreground">
            {posting.shortDescription}
          </p>
        </div>
      </div>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
      {children}
    </span>
  );
}
