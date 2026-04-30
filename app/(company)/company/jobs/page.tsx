import Link from "next/link";

import { Button } from "@/components/ui/button";
import { JobsList } from "@/features/job-postings/jobs-list";
import { requireRole } from "@/lib/auth/guards";
import { listJobPostingsForCompany } from "@/server/services/job-posting-service";

export const metadata = {
  title: "Job postings",
};

export default async function CompanyJobsPage() {
  const user = await requireRole("COMPANY");
  const rows = await listJobPostingsForCompany(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Job postings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Drafts stay private until you publish. Only approved companies
            can publish to the public list.
          </p>
        </div>
        <Button asChild>
          <Link href="/company/jobs/new">New posting</Link>
        </Button>
      </header>
      <section className="mx-auto w-full max-w-5xl">
        <JobsList rows={rows} />
      </section>
    </main>
  );
}
