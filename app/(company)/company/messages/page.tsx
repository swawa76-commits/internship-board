import { ThreadList } from "@/features/messages/thread-list";
import { requireRole } from "@/lib/auth/guards";
import { listThreadsForCompany } from "@/server/services/message-service";

export const metadata = {
  title: "Messages",
};

export default async function CompanyMessagesPage() {
  const user = await requireRole("COMPANY");
  const threads = await listThreadsForCompany(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {threads.length}{" "}
          {threads.length === 1 ? "conversation" : "conversations"}.
          Start a thread from any applicant on the Applicants page.
        </p>
      </header>
      <section className="mx-auto w-full max-w-4xl">
        <ThreadList
          threads={threads}
          basePath="/company/messages"
          emptyHref="/company/applications"
          emptyAction="Open Applicants"
          emptyMessage="No conversations yet. You can reach out to any applicant from the Applicants page."
        />
      </section>
    </main>
  );
}
