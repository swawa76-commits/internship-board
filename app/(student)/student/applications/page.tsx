import Link from "next/link";

import { Button } from "@/components/ui/button";
import { withdrawApplicationAction } from "@/features/applications/actions";
import { requireRole } from "@/lib/auth/guards";
import {
  ACTIVE_APPLICATION_STATUSES,
  listApplicationsForStudent,
} from "@/server/services/application-service";

export const metadata = {
  title: "Your applications",
};

const STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  IN_REVIEW: "In review",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export default async function StudentApplicationsPage() {
  const user = await requireRole("STUDENT");
  const applications = await listApplicationsForStudent(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your applications
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {applications.length}{" "}
          {applications.length === 1
            ? "submitted application"
            : "submitted applications"}
          .
        </p>
      </header>

      <section className="mx-auto w-full max-w-5xl">
        {applications.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t applied to any internships yet.
            </p>
            <Link
              href="/jobs"
              className="mt-4 inline-block text-sm font-medium hover:underline"
            >
              Browse open internships →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Posting</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Applied</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium">
                        {/* Linkable when the posting is still publicly
                            visible OR when the student is an active
                            applicant (the detail page allows that
                            bypass). The closed-funnel statuses
                            (REJECTED / WITHDRAWN) drop out of the
                            bypass set so we render plain text there. */}
                        {a.jobPosting.status === "PUBLISHED" ||
                        (
                          [
                            "APPLIED",
                            "IN_REVIEW",
                            "INTERVIEWING",
                            "OFFER",
                          ] as ReadonlyArray<string>
                        ).includes(a.status) ? (
                          <Link
                            className="hover:underline"
                            href={`/companies/${a.jobPosting.company.companySlug}/jobs/${a.jobPosting.jobSlug}`}
                          >
                            {a.jobPosting.title}
                          </Link>
                        ) : (
                          a.jobPosting.title
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.jobPosting.company.companyName}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-block rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs">
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                      {a.appliedAt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      {(
                        ACTIVE_APPLICATION_STATUSES as ReadonlyArray<string>
                      ).includes(a.status) ? (
                        <form action={withdrawApplicationAction}>
                          <input
                            type="hidden"
                            name="applicationId"
                            value={a.id}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            Withdraw
                          </Button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
