import Link from "next/link";

import type { ThreadListItem } from "@/server/services/message-service";

/**
 * Inbox list. Tenant-agnostic — the calling page resolves the threads
 * for the right viewer and passes a base path for thread detail
 * navigation (`/student/messages` or `/company/messages`).
 */
export function ThreadList({
  threads,
  basePath,
  emptyHref,
  emptyAction,
  emptyMessage,
}: {
  threads: ThreadListItem[];
  basePath: string;
  emptyHref: string;
  emptyAction: string;
  emptyMessage: string;
}) {
  if (threads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        <Link
          href={emptyHref}
          className="mt-3 inline-block text-sm font-medium hover:underline"
        >
          {emptyAction} →
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {threads.map((t) => (
        <li key={t.threadId}>
          <Link
            href={`${basePath}/${t.threadId}`}
            className="flex flex-col gap-1 p-4 hover:bg-accent/40"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{t.counterparty.name}</p>
              <p className="text-xs text-muted-foreground">
                {t.updatedAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.jobPosting.title}
            </p>
            {t.lastMessage ? (
              <p className="line-clamp-1 text-sm">
                <span className="text-muted-foreground">
                  {t.lastMessage.senderRole === "COMPANY"
                    ? "Company: "
                    : "Student: "}
                </span>
                {t.lastMessage.body}
              </p>
            ) : null}
            {t.unreadForViewer > 0 ? (
              <span className="inline-block w-fit rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] text-primary-foreground">
                {t.unreadForViewer} unread
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
