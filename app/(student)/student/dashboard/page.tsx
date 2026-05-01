import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import { CompletenessMeter } from "@/features/students/completeness-meter";
import { requireRole } from "@/lib/auth/guards";
import { calculateCompleteness } from "@/lib/students/completeness";
import { listApplicationsForStudent } from "@/server/services/application-service";
import { needsStudentOnboarding } from "@/server/services/onboarding-service";
import { listSavedJobsForStudent } from "@/server/services/saved-job-service";
import { getStudentProfileByUserId } from "@/server/services/student-service";

export const metadata = {
  title: "Student dashboard",
};

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  IN_REVIEW: "In review",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const RECENT_APPLICATIONS_LIMIT = 5;
const SAVED_PREVIEW_LIMIT = 5;

export default async function StudentDashboardPage() {
  const user = await requireRole("STUDENT");

  // Defense in depth: even if a student lands here directly (bookmark,
  // back button, deep link), bounce them to onboarding while incomplete.
  if (await needsStudentOnboarding(user.id)) {
    redirect("/student/onboarding");
  }

  const [profile, applications, saved] = await Promise.all([
    getStudentProfileByUserId(user.id),
    listApplicationsForStudent(user.id),
    listSavedJobsForStudent(user.id),
  ]);

  const completeness = profile
    ? calculateCompleteness({
        fullName: profile.fullName,
        headline: profile.headline,
        university: profile.university,
        graduationYear: profile.graduationYear,
        degree: profile.degree,
        major: profile.major,
        location: profile.location,
        workAuthorization: profile.workAuthorization,
        bio: profile.bio,
        resumeStorageKey: profile.resumeStorageKey,
        skillCount: profile.skills.length,
        experienceCount: profile.experiences.length,
        projectCount: profile.projects.length,
      })
    : null;

  const recentApplications = applications.slice(0, RECENT_APPLICATIONS_LIMIT);
  const savedPreview = saved.slice(0, SAVED_PREVIEW_LIMIT);

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Student dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "your account"}.
          </p>
        </div>
        <LogoutButton />
      </header>

      {completeness && !completeness.isComplete ? (
        <section
          className="mx-auto w-full max-w-5xl space-y-3"
          aria-label="Profile completeness"
        >
          <CompletenessMeter completeness={completeness} />
          <div>
            <Button asChild size="sm">
              <Link href="/student/profile">Complete your profile</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
        <Widget
          title="Recent applications"
          ctaHref="/student/applications"
          ctaLabel={
            applications.length > RECENT_APPLICATIONS_LIMIT
              ? `View all ${applications.length}`
              : "View applications"
          }
        >
          {recentApplications.length === 0 ? (
            <EmptyState
              message="You haven't applied to any internships yet."
              actionHref="/jobs"
              actionLabel="Browse open postings"
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentApplications.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.jobPosting.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.jobPosting.company.companyName} ·{" "}
                      {a.appliedAt.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
                    {APPLICATION_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget
          title="Saved postings"
          ctaHref="/student/saved-job-postings"
          ctaLabel={
            saved.length > SAVED_PREVIEW_LIMIT
              ? `View all ${saved.length}`
              : "View saved"
          }
        >
          {savedPreview.length === 0 ? (
            <EmptyState
              message="No saved postings yet."
              actionHref="/jobs"
              actionLabel="Find roles to save"
            />
          ) : (
            <ul className="divide-y divide-border">
              {savedPreview.map((s) => {
                const j = s.jobPosting;
                const detailHref = `/companies/${j.company.companySlug}/jobs/${j.jobSlug}`;
                return (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {j.isCurrentlyOpen ? (
                          <Link className="hover:underline" href={detailHref}>
                            {j.title}
                          </Link>
                        ) : (
                          j.title
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {j.company.companyName}
                      </p>
                    </div>
                    {j.isCurrentlyOpen ? (
                      <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
                        Open
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        Closed
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Widget>
      </section>

      <section className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">
          Looking for new internships?{" "}
          <Link
            className="font-medium text-foreground hover:underline"
            href="/jobs"
          >
            Browse open postings →
          </Link>
        </p>
      </section>
    </main>
  );
}

function Widget({
  title,
  ctaHref,
  ctaLabel,
  children,
}: {
  title: string;
  ctaHref: string;
  ctaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          href={ctaHref}
        >
          {ctaLabel} →
        </Link>
      </header>
      <div className="text-sm">{children}</div>
    </article>
  );
}

function EmptyState({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        className="mt-2 inline-block text-sm font-medium hover:underline"
        href={actionHref}
      >
        {actionLabel} →
      </Link>
    </div>
  );
}
