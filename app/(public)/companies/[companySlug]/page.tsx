import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicCompanyBySlug } from "@/server/services/public-job-search";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const company = await getPublicCompanyBySlug(companySlug);
  if (!company) return { title: "Company not found" };
  return {
    title: company.companyName,
    description: company.shortDescription ?? undefined,
  };
}

export default async function PublicCompanyPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const company = await getPublicCompanyBySlug(companySlug);
  if (!company) notFound();

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <nav className="mx-auto w-full max-w-5xl text-sm text-muted-foreground">
        <Link href="/jobs" className="hover:text-foreground">
          ← Back to all internships
        </Link>
      </nav>

      <header className="mx-auto flex w-full max-w-5xl items-start gap-4">
        {company.logoStorageKey ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/files/logo/${encodeURIComponent(company.logoStorageKey)}`}
            alt=""
            className="size-20 rounded-md border border-border bg-muted object-contain"
          />
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {company.companyName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {company.industry ?? "—"}
            {company.headquarters ? <> · {company.headquarters}</> : null}
            {company.companySize ? <> · {company.companySize}</> : null}
          </p>
          {company.websiteUrl ? (
            <p className="text-sm">
              <a
                href={company.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                Visit website →
              </a>
            </p>
          ) : null}
        </div>
      </header>

      {company.description ? (
        <section className="mx-auto w-full max-w-5xl space-y-3">
          <h2 className="text-lg font-semibold">About</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {company.description}
          </p>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-5xl space-y-3">
        <h2 className="text-lg font-semibold">Open internships</h2>
        {company.jobPostings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open postings right now.
          </p>
        ) : (
          <ul className="grid gap-3">
            {company.jobPostings.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <Link
                  href={`/companies/${company.slug}/jobs/${p.slug}`}
                  className="text-base font-medium hover:underline"
                >
                  {p.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.workplaceType}
                  {p.internshipTerm ? <> · {p.internshipTerm}</> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
