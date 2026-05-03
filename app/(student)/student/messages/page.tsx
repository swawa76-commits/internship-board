import { ThreadList } from "@/features/messages/thread-list";
import { requireRole } from "@/lib/auth/guards";
import { listThreadsForStudent } from "@/server/services/message-service";

export const metadata = {
  title: "Messages",
};

export default async function StudentMessagesPage() {
  const user = await requireRole("STUDENT");
  const threads = await listThreadsForStudent(user.id);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {threads.length}{" "}
          {threads.length === 1 ? "conversation" : "conversations"}.
          Companies can reach out about your applications — you&apos;ll see
          replies here.
        </p>
      </header>

      <section className="mx-auto w-full max-w-4xl">
        <ThreadList
          threads={threads}
          basePath="/student/messages"
          emptyHref="/student/applications"
          emptyAction="View your applications"
          emptyMessage="No conversations yet. Companies will reach out here once they want to talk about your application."
        />
      </section>
    </main>
  );
}
