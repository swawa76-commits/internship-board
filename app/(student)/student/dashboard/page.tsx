import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import { requireRole } from "@/lib/auth/guards";
import { needsStudentOnboarding } from "@/server/services/onboarding-service";

export const metadata = {
  title: "Student dashboard",
};

export default async function StudentDashboardPage() {
  const user = await requireRole("STUDENT");

  // Defense in depth: even if a student lands here directly (bookmark,
  // back button, deep link), bounce them to onboarding while incomplete.
  if (await needsStudentOnboarding(user.id)) {
    redirect("/student/onboarding");
  }

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

      <section className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-3">
        <DashboardCard
          title="Profile"
          description="Keep your profile current so applications go out with the latest info."
          ctaHref="/student/profile"
          ctaLabel="View profile"
        />
        <DashboardCard
          title="Applications"
          description="Track where you've applied and where you stand."
          ctaHref="/student/applications"
          ctaLabel="View applications"
        />
        <DashboardCard
          title="Saved postings"
          description="Roles you bookmarked to come back to."
          ctaHref="/student/saved-job-postings"
          ctaLabel="View saved"
        />
      </section>

      <section className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">
          Looking for new internships?{" "}
          <Link className="font-medium text-foreground hover:underline" href="/job-postings">
            Browse open postings →
          </Link>
        </p>
      </section>
    </main>
  );
}

function DashboardCard({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline" size="sm" className="mt-auto self-start">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </article>
  );
}
