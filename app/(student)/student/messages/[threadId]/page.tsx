import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplyForm } from "@/features/messages/reply-form";
import { ThreadView } from "@/features/messages/thread-view";
import { requireRole } from "@/lib/auth/guards";
import { getThreadForStudent } from "@/server/services/message-service";

export const metadata = {
  title: "Conversation",
};

export default async function StudentThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireRole("STUDENT");
  const thread = await getThreadForStudent(user.id, threadId);

  // Tenant mismatch and missing thread are indistinguishable to the
  // caller — both 404. The service collapses them on purpose.
  if (!thread) notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <nav className="mx-auto w-full max-w-3xl text-sm text-muted-foreground">
        <Link href="/student/messages" className="hover:text-foreground">
          ← Back to messages
        </Link>
      </nav>

      <header className="mx-auto w-full max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {thread.counterparty.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          About:{" "}
          {thread.counterparty.companySlug ? (
            <Link
              className="font-medium text-foreground hover:underline"
              href={`/companies/${thread.counterparty.companySlug}/jobs/${thread.jobPosting.jobSlug}`}
            >
              {thread.jobPosting.title}
            </Link>
          ) : (
            <span className="font-medium text-foreground">
              {thread.jobPosting.title}
            </span>
          )}
        </p>
      </header>

      <section className="mx-auto w-full max-w-3xl">
        <ThreadView thread={thread} viewerRole="STUDENT" />
      </section>

      <section className="mx-auto w-full max-w-3xl">
        {thread.threadClosed ? (
          <p
            role="status"
            className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            Chat closed — this application is{" "}
            <span className="font-mono text-xs">
              {thread.applicationStatus}
            </span>
            . You can still read the conversation, but no new replies are
            accepted.
          </p>
        ) : thread.canReply ? (
          <ReplyForm threadId={thread.threadId} role="STUDENT" />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            You can reply once the company sends a message.
          </p>
        )}
      </section>
    </main>
  );
}
