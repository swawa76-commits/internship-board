import { redirect } from "next/navigation";

import {
  EMPTY_JOB_POSTING_DEFAULTS,
  JobPostingForm,
} from "@/features/job-postings/job-posting-form";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";
import { needsCompanyOnboarding } from "@/server/services/onboarding-service";

export const metadata = {
  title: "New job posting",
};

export default async function NewJobPostingPage() {
  const user = await requireRole("COMPANY");

  // A company without a profile can't have postings. Send them through
  // onboarding rather than rendering a form they can't actually use.
  if (await needsCompanyOnboarding(user.id)) {
    redirect("/company/onboarding");
  }

  const approvalStatus = await getFreshCompanyApprovalStatus(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-3xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          New posting
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Create a job posting
        </h1>
      </header>
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card p-6">
        <JobPostingForm
          mode={{ kind: "create" }}
          defaults={EMPTY_JOB_POSTING_DEFAULTS}
          approvalStatus={approvalStatus}
        />
      </section>
    </main>
  );
}
