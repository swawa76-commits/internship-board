import Link from "next/link";

import { LogoutButton } from "@/features/auth/logout-button";
import { requireRole } from "@/lib/auth/guards";
import {
  getAdminDashboard,
  listProgramTags,
  type TimeWindow,
} from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin dashboard",
};

const VALID_WINDOWS = new Set<TimeWindow>(["7d", "30d", "90d", "all"]);
const WINDOW_LABEL: Record<TimeWindow, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function pickWindow(value: string | undefined): TimeWindow {
  return value && VALID_WINDOWS.has(value as TimeWindow)
    ? (value as TimeWindow)
    : "7d";
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("ADMIN");
  const params = await searchParams;
  const programTag = readParam(params.programTag).trim() || null;
  const applicationsWindow = pickWindow(readParam(params.window));

  const [dashboardR, tagsR] = await Promise.all([
    getAdminDashboard(user.id, { programTag, applicationsWindow }),
    listProgramTags(user.id),
  ]);

  // The page guard already enforces ADMIN; this is belt-and-braces.
  if (!dashboardR.ok) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-12">
        <p className="mx-auto max-w-3xl text-sm text-destructive">
          You don&apos;t have access to admin metrics.
        </p>
      </main>
    );
  }
  const d = dashboardR.data;
  const tags = tagsR.ok ? tagsR.data : [];

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "your account"}.
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="mx-auto w-full max-w-6xl">
        <FilterBar
          window={applicationsWindow}
          programTag={programTag}
          tags={tags}
        />
      </section>

      <section
        className="mx-auto grid w-full max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Overview metrics"
      >
        <MetricCard label="Total students" value={d.overview.totalStudents} />
        <MetricCard
          label="Profile complete"
          value={d.overview.studentsCompleteProfiles}
          sub={`${d.overview.studentsIncompleteProfiles} incomplete`}
        />
        <MetricCard label="Total companies" value={d.overview.totalCompanies} />
        <MetricCard
          label="Approved companies"
          value={d.overview.approvedCompanies}
          sub={`${d.overview.pendingCompanies} pending · ${d.overview.suspendedCompanies} suspended`}
        />
        <MetricCard
          label="Published postings"
          value={d.overview.publishedJobPostings}
          sub={`${d.overview.openJobPostings} currently open`}
        />
        <MetricCard
          label="Total postings"
          value={d.overview.totalJobPostings}
          sub={`${d.overview.jobPostingsByStatus.DRAFT} draft · ${d.overview.jobPostingsByStatus.CLOSED} closed`}
        />
        <MetricCard
          label="Total applications"
          value={d.overview.totalApplications}
        />
        <MetricCard
          label={`Applications · ${WINDOW_LABEL[applicationsWindow]}`}
          value={d.overview.applicationsInSelectedWindow}
          sub={`7d ${d.overview.applicationsLast7Days} · 30d ${d.overview.applicationsLast30Days} · 90d ${d.overview.applicationsLast90Days}`}
        />
      </section>

      <section
        className="mx-auto w-full max-w-6xl rounded-lg border border-border bg-card p-5"
        aria-label="Funnel snapshot"
      >
        <h2 className="text-lg font-semibold">Funnel snapshot</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <FunnelStep label="Published postings" value={d.funnel.publishedJobPostings} />
          <FunnelStep
            label="Postings w/ ≥1 applicant"
            value={d.funnel.jobPostingsWithAtLeastOneApplicant}
          />
          <FunnelStep label="Applications" value={d.funnel.totalApplications} />
          <FunnelStep label="In review" value={d.funnel.inReview} />
          <FunnelStep label="Interviewing" value={d.funnel.interviewing} />
          <FunnelStep label="Offer" value={d.funnel.offer} />
          <FunnelStep label="Rejected" value={d.funnel.rejected} />
        </div>
      </section>

      <section
        className="mx-auto w-full max-w-6xl rounded-lg border border-border bg-card p-5"
        aria-label="Operational alerts"
      >
        <h2 className="text-lg font-semibold">Needs attention</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlertItem
            label="Pending companies"
            value={d.alerts.pendingCompanies}
            href="/admin/companies"
          />
          <AlertItem
            label="Draft postings"
            value={d.alerts.draftJobPostings}
          />
          <AlertItem
            label="Closing in 7 days"
            value={d.alerts.jobPostingsClosingIn7Days}
          />
          <AlertItem
            label="Zero applicants after 14 days"
            value={d.alerts.jobPostingsZeroApplicantsAfter14Days}
          />
        </ul>
      </section>

      <section
        className="mx-auto w-full max-w-6xl rounded-lg border border-border bg-card p-5"
        aria-label="Top performing job postings"
      >
        <h2 className="text-lg font-semibold">Top performing postings</h2>
        {d.topJobPostings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No postings yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Posting</th>
                  <th className="px-2 py-2 font-medium">Company</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Published</th>
                  <th className="px-2 py-2 font-medium">Applications</th>
                  <th className="px-2 py-2 font-medium">Tag</th>
                </tr>
              </thead>
              <tbody>
                {d.topJobPostings.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2 font-medium">{p.title}</td>
                    <td className="px-2 py-2">{p.companyName}</td>
                    <td className="px-2 py-2 font-mono text-xs">{p.status}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {p.publishedAt
                        ? p.publishedAt.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono">{p.applicationCount}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {p.programTag ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="mx-auto w-full max-w-6xl rounded-lg border border-border bg-card p-5"
        aria-label="Company participation"
      >
        <h2 className="text-lg font-semibold">Company participation</h2>
        {d.companyParticipation.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No companies yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Company</th>
                  <th className="px-2 py-2 font-medium">Approval</th>
                  <th className="px-2 py-2 font-medium">Open postings</th>
                  <th className="px-2 py-2 font-medium">Total applicants</th>
                  <th className="px-2 py-2 font-medium">Last activity</th>
                  <th className="px-2 py-2 font-medium">Tag</th>
                </tr>
              </thead>
              <tbody>
                {d.companyParticipation.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2 font-medium">{c.companyName}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.approvalStatus}</td>
                    <td className="px-2 py-2 font-mono">{c.openJobPostings}</td>
                    <td className="px-2 py-2 font-mono">{c.totalApplicants}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {c.lastActivityAt
                        ? c.lastActivityAt.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {c.programTag ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="mx-auto w-full max-w-6xl rounded-lg border border-border bg-card p-5"
        aria-label="Recent activity"
      >
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {d.recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No activity yet.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border">
            {d.recentActivity.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <p className="text-sm">
                  <span className="font-mono text-xs">{e.type}</span>
                  {e.entityType ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-muted-foreground">
                        {e.entityType}
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.createdAt.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function FilterBar({
  window: w,
  programTag,
  tags,
}: {
  window: TimeWindow;
  programTag: string | null;
  tags: string[];
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4 text-sm"
    >
      <div className="space-y-1">
        <label htmlFor="window" className="text-xs font-medium text-muted-foreground">
          Time window
        </label>
        <select
          id="window"
          name="window"
          defaultValue={w}
          className="rounded-md border border-input bg-background px-3 py-1.5"
        >
          {(["7d", "30d", "90d", "all"] as TimeWindow[]).map((opt) => (
            <option key={opt} value={opt}>
              {WINDOW_LABEL[opt]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label
          htmlFor="programTag"
          className="text-xs font-medium text-muted-foreground"
        >
          Program tag
        </label>
        <select
          id="programTag"
          name="programTag"
          defaultValue={programTag ?? ""}
          className="rounded-md border border-input bg-background px-3 py-1.5"
        >
          <option value="">All programs</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        Apply
      </button>
      {programTag || w !== "7d" ? (
        <Link href="/admin" className="text-sm font-medium hover:underline">
          Reset
        </Link>
      ) : null}
    </form>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </article>
  );
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function AlertItem({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-xl font-semibold tabular-nums ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block hover:underline">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
