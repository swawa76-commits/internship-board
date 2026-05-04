import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StartThreadForm } from "@/features/messages/start-thread-form";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { getThreadIdForApplicationAsCompany } from "@/server/services/message-service";

export const metadata = {
  title: "Message applicant",
};

/**
 * Company-only intermediary page: if a thread already exists for this
 * application, redirect into it; otherwise render the StartThreadForm.
 * The applicant-list "Message" button links here unconditionally.
 */
export default async function StartThreadPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const user = await requireRole("COMPANY");

  const existing = await getThreadIdForApplicationAsCompany(
    user.id,
    applicationId,
  );
  if (existing) redirect(`/company/messages/${existing}`);

  // Resolve the applicant + posting strictly under tenant scope. If
  // the application doesn't belong to this company, treat as 404 —
  // the messaging service will reject the action regardless, but we
  // refuse to render the composer at all.
  const company = await prisma.companyProfile.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!company) notFound();

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      jobPosting: { companyProfileId: company.id },
    },
    select: {
      id: true,
      status: true,
      studentProfile: { select: { fullName: true } },
      jobPosting: { select: { title: true } },
    },
  });
  if (!application) notFound();

  // Mirror the message-service `thread_closed` rule at the route so
  // we never render a composer that the action will reject.
  const closed =
    application.status === "REJECTED" || application.status === "WITHDRAWN";

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <nav className="mx-auto w-full max-w-3xl text-sm text-muted-foreground">
        <Link href="/company/applications" className="hover:text-foreground">
          ← Back to applicants
        </Link>
      </nav>
      <header className="mx-auto w-full max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Message {application.studentProfile.fullName}
        </h1>
        <p className="text-sm text-muted-foreground">
          About: {application.jobPosting.title}
        </p>
      </header>
      <section className="mx-auto w-full max-w-3xl rounded-md border border-border bg-card p-5">
        {closed ? (
          <p role="status" className="text-sm text-muted-foreground">
            This application is{" "}
            <span className="font-mono text-xs">{application.status}</span> —
            chat is closed and no new threads can be started.
          </p>
        ) : (
          <StartThreadForm applicationId={application.id} />
        )}
      </section>
    </main>
  );
}
