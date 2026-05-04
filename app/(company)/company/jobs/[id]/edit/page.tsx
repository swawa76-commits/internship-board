import { notFound } from "next/navigation";

import {
  JobPostingForm,
  type JobPostingFormDefaults,
} from "@/features/job-postings/job-posting-form";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";
import { getJobPostingByIdForCompany } from "@/server/services/job-posting-service";

export const metadata = {
  title: "Edit job posting",
};

function isoDateOrEmpty(d: Date | null): string {
  if (!d) return "";
  // The <input type="date"> wants YYYY-MM-DD; toISOString gives that prefix.
  return d.toISOString().slice(0, 10);
}

export default async function EditJobPostingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("COMPANY");
  const { id } = await params;
  const posting = await getJobPostingByIdForCompany(user.id, id);
  if (!posting) notFound();

  // V1 form scope: companies edit DRAFT and PUBLISHED postings only.
  // Postings sitting in PAUSED, CLOSED, or ARCHIVED are managed by
  // future workflows (admin tools or status-transition actions). Render
  // a read-only notice instead of silently letting Save downgrade the
  // status to DRAFT — that would be quiet data loss.
  if (posting.status !== "DRAFT" && posting.status !== "PUBLISHED") {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-12">
        <header className="mx-auto w-full max-w-3xl space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Edit posting
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {posting.title}
          </h1>
        </header>
        <section className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card p-6">
          <p role="status" className="text-sm text-muted-foreground">
            This posting is currently <b>{posting.status}</b>. The V1 self-serve
            form supports DRAFT and PUBLISHED only. Postings in other states are
            managed by an admin — reach out if you need this one moved.
          </p>
        </section>
      </main>
    );
  }

  const approvalStatus = await getFreshCompanyApprovalStatus(user.id);

  const defaults: JobPostingFormDefaults = {
    title: posting.title,
    department: posting.department ?? "",
    location: posting.location ?? "",
    workplaceType: posting.workplaceType,
    internshipTerm: posting.internshipTerm ?? "",
    startDate: isoDateOrEmpty(posting.startDate),
    duration: posting.duration ?? "",
    compensationType: posting.compensationType ?? "",
    compensationMin:
      posting.compensationMin != null ? String(posting.compensationMin) : "",
    compensationMax:
      posting.compensationMax != null ? String(posting.compensationMax) : "",
    description: posting.description,
    responsibilities: posting.responsibilities ?? "",
    qualifications: posting.qualifications ?? "",
    applicationDeadline: isoDateOrEmpty(posting.applicationDeadline),
    programTag: posting.programTag ?? "",
    status: posting.status,
  };

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-3xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Edit posting
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {posting.title}
        </h1>
      </header>
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card p-6">
        <JobPostingForm
          mode={{ kind: "edit", jobPostingId: posting.id }}
          defaults={defaults}
          approvalStatus={approvalStatus}
        />
      </section>
    </main>
  );
}
