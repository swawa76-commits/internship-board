import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplyForm } from "@/features/messages/reply-form";
import { ThreadView } from "@/features/messages/thread-view";
import { requireRole } from "@/lib/auth/guards";
import { getThreadForCompany } from "@/server/services/message-service";

export const metadata = {
  title: "Conversation",
};

export default async function CompanyThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireRole("COMPANY");
  const thread = await getThreadForCompany(user.id, threadId);
  if (!thread) notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <nav className="mx-auto w-full max-w-3xl text-sm text-muted-foreground">
        <Link href="/company/messages" className="hover:text-foreground">
          ← Back to messages
        </Link>
      </nav>

      <header className="mx-auto w-full max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {thread.counterparty.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          About: {thread.jobPosting.title}
        </p>
      </header>

      <section className="mx-auto w-full max-w-3xl">
        <ThreadView thread={thread} viewerRole="COMPANY" />
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
        ) : (
          <ReplyForm threadId={thread.threadId} role="COMPANY" />
        )}
      </section>
    </main>
  );
}
