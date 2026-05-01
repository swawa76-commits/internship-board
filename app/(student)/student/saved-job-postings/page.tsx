import Link from "next/link";

import { SaveJobToggle } from "@/features/saved-job-postings/save-job-toggle";
import { requireRole } from "@/lib/auth/guards";
import { listSavedJobsForStudent } from "@/server/services/saved-job-service";

export const metadata = {
  title: "Saved postings",
};

const TERM_LABEL: Record<string, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

export default async function StudentSavedJobsPage() {
  const user = await requireRole("STUDENT");
  const saved = await listSavedJobsForStudent(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Saved postings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {saved.length}{" "}
          {saved.length === 1 ? "saved posting" : "saved postings"}.
        </p>
      </header>

      <section className="mx-auto w-full max-w-5xl">
        {saved.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t saved any postings yet.
            </p>
            <Link
              href="/jobs"
              className="mt-4 inline-block text-sm font-medium hover:underline"
            >
              Browse open internships →
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4">
            {saved.map((s) => {
              const j = s.jobPosting;
              const detailHref = `/companies/${j.company.companySlug}/jobs/${j.jobSlug}`;
              return (
                <li
                  key={s.id}
                  className="rounded-md border border-border bg-card p-5"
                >
                  <div className="flex items-start gap-4">
                    {j.company.logoStorageKey ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/files/logo/${encodeURIComponent(j.company.logoStorageKey)}`}
                        alt=""
                        className="size-12 rounded-md border border-border bg-muted object-contain"
                      />
                    ) : (
                      <div className="size-12 rounded-md border border-border bg-muted" />
                    )}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                          {j.isCurrentlyOpen ? (
                            <Link className="hover:underline" href={detailHref}>
                              {j.title}
                            </Link>
                          ) : (
                            j.title
                          )}
                        </h2>
                        <SaveJobToggle jobPostingId={j.id} isSaved={true} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {j.company.companyName} ·{" "}
                        {TERM_LABEL[j.workplaceType] ?? j.workplaceType}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        {j.isCurrentlyOpen ? (
                          <span className="inline-block rounded-full border border-border bg-background px-2 py-0.5 font-mono">
                            Open
                          </span>
                        ) : (
                          <span className="inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                            No longer accepting applications
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          Saved{" "}
                          {s.savedAt.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
