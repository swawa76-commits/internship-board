import type { ThreadDetail } from "@/server/services/message-service";

/**
 * Read-only message rail for a single thread. Shared between both
 * roles. The composer is rendered separately by the caller so it can
 * hide it for a student who isn't allowed to reply yet (`canReply`).
 */
export function ThreadView({
  thread,
  viewerRole,
}: {
  thread: ThreadDetail;
  viewerRole: "STUDENT" | "COMPANY";
}) {
  return (
    <ol className="flex flex-col gap-3">
      {thread.messages.map((m) => {
        const mine = m.senderRole === viewerRole;
        return (
          <li
            key={m.id}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            <article
              className={`max-w-[75%] space-y-1 rounded-md border border-border px-3 py-2 ${
                mine
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground"
              }`}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {m.body}
              </p>
              <p
                className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
              >
                {m.senderRole === "COMPANY" ? "Company" : "Student"} ·{" "}
                {m.createdAt.toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
