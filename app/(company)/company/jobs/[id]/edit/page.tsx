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

  const approvalStatus = await getFreshCompanyApprovalStatus(user.id);

  // Coerce DB nulls + dates into the string-based defaults the form
  // needs. Statuses other than DRAFT/PUBLISHED — postings flipped to
  // PAUSED/CLOSED/ARCHIVED by future workflows — show up here as their
  // raw value but the form's status select limits user transitions.
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
    // Edits in the V1 UI move between DRAFT and PUBLISHED. A posting
    // that was previously moved to PAUSED/CLOSED/ARCHIVED via a future
    // admin tool falls back to DRAFT for safety.
    status:
      posting.status === "PUBLISHED" || posting.status === "DRAFT"
        ? posting.status
        : "DRAFT",
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
