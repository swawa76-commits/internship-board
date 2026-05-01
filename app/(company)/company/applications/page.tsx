import Link from "next/link";

import { ApplicantRow } from "@/features/applications/applicant-row";
import { requireRole } from "@/lib/auth/guards";
import { listApplicationsForCompany } from "@/server/services/application-service";

export const metadata = {
  title: "Applicants",
};

const STATUS_GROUPS: Array<{ label: string; statuses: string[] }> = [
  { label: "New", statuses: ["APPLIED"] },
  { label: "In review", statuses: ["IN_REVIEW"] },
  { label: "Interviewing", statuses: ["INTERVIEWING"] },
  { label: "Offer", statuses: ["OFFER"] },
  { label: "Closed", statuses: ["REJECTED", "WITHDRAWN"] },
];

export default async function CompanyApplicationsPage() {
  const user = await requireRole("COMPANY");
  const rows = await listApplicationsForCompany(user.id);

  if (rows.length === 0) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-12">
        <header className="mx-auto w-full max-w-5xl">
          <h1 className="text-3xl font-semibold tracking-tight">Applicants</h1>
        </header>
        <section className="mx-auto w-full max-w-5xl">
          <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No applications yet.
            </p>
            <Link
              href="/company/jobs"
              className="mt-3 inline-block text-sm font-medium hover:underline"
            >
              Manage your postings →
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // Group rows by status. listApplicationsForCompany already orders
  // alphabetically-by-status then descending appliedAt.
  const grouped = STATUS_GROUPS.map((g) => ({
    label: g.label,
    rows: rows.filter((r) => g.statuses.includes(r.status)),
  })).filter((g) => g.rows.length > 0);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">Applicants</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "application" : "applications"}
          {" "}across all your postings.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {grouped.map((group) => (
          <section key={group.label} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {group.label}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {group.rows.length}
              </span>
            </h2>
            <div className="grid gap-3">
              {group.rows.map((row) => (
                <ApplicantRow key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
