import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import { CompanyApprovalBanner } from "@/features/companies/approval-banner";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";
import { needsCompanyOnboarding } from "@/server/services/onboarding-service";

export const metadata = {
  title: "Company dashboard",
};

export default async function CompanyDashboardPage() {
  const user = await requireRole("COMPANY");

  // Defense in depth: bookmark / deep-link / back-button hits while
  // onboarding is incomplete should still land in the onboarding flow.
  if (await needsCompanyOnboarding(user.id)) {
    redirect("/company/onboarding");
  }

  // Always read fresh from DB — admins may flip approval mid-session.
  const approvalStatus = await getFreshCompanyApprovalStatus(user.id);

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Company dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "your account"}.
          </p>
        </div>
        <LogoutButton />
      </header>

      {approvalStatus ? (
        <div className="mx-auto w-full max-w-5xl">
          <CompanyApprovalBanner status={approvalStatus} />
        </div>
      ) : null}

      <section className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-3">
        <DashboardCard
          title="Company profile"
          description="Keep your description, logo, and contact details up to date."
          ctaHref="/company/profile"
          ctaLabel="Edit profile"
        />
        <DashboardCard
          title="Job postings"
          description="Draft, publish, and manage your internship postings."
          ctaHref="/company/jobs"
          ctaLabel="Manage postings"
        />
        <DashboardCard
          title="Applicants"
          description="Review who has applied and update their status."
          ctaHref="/company/applications"
          ctaLabel="View applicants"
        />
      </section>

      <section className="mx-auto w-full max-w-5xl">
        <p className="text-sm text-muted-foreground">
          Need to message an applicant?{" "}
          <Link
            className="font-medium text-foreground hover:underline"
            href="/company/messages"
          >
            Open messages →
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
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-auto self-start"
      >
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </article>
  );
}
