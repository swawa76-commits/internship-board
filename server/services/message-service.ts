import "server-only";

import { prisma } from "@/lib/db/client";
import type { ApplicationStatus } from "@/lib/db/generated/enums";
import {
  dispatchEmail,
  newMessage,
} from "@/server/services/email-service";

/**
 * Message service. Tenant isolation is enforced here — no route or
 * action ever queries `MessageThread` / `Message` directly.
 *
 * Product rules from CLAUDE.md:
 *  - A thread always belongs to exactly one Application. No cold outreach.
 *  - Only a COMPANY can INITIATE a thread, and only with applicants to
 *    one of their own postings.
 *  - A STUDENT may REPLY only after a company has initiated; they
 *    cannot send the first message.
 *  - A STUDENT only sees threads tied to their own applications.
 *  - A COMPANY only sees threads tied to applications on their postings.
 *  - Soft-deleted user / company rows are invisible (consistent with
 *    the rest of the service layer).
 *
 * On error semantics: we deliberately collapse "thread doesn't exist"
 * and "thread isn't yours" into a single `forbidden` reason for cross-
 * tenant probes — never leak existence to a non-owner. `not_found`
 * is reserved for legitimately missing resources the caller should
 * know about (e.g., the application they own was deleted).
 */

export type SendMessageFailureReason =
  | "forbidden"
  | "thread_not_found"
  | "empty"
  | "students_cannot_initiate"
  | "thread_closed";

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: SendMessageFailureReason };

export type StartThreadFailureReason =
  | "forbidden"
  | "application_not_found"
  | "empty"
  | "thread_closed";

export type StartThreadResult =
  | { ok: true; threadId: string; messageId: string }
  | { ok: false; reason: StartThreadFailureReason };

/**
 * Application statuses that close a thread to new sends. Reads are
 * still allowed — the historical conversation should remain visible
 * to both sides. Source of truth for this rule.
 *
 *   REJECTED   — company-side terminal: chat closed.
 *   WITHDRAWN  — student-side terminal: chat closed.
 *   APPLIED / IN_REVIEW / INTERVIEWING / OFFER — chat open.
 *
 * OFFER deliberately stays open: it's where logistics and acceptance
 * conversation happen.
 */
const CLOSED_STATUSES = new Set<ApplicationStatus>(["REJECTED", "WITHDRAWN"]);
function isClosed(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.has(status);
}

export type ThreadListItem = {
  threadId: string;
  applicationId: string;
  applicationStatus: ApplicationStatus;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
  };
  /** From the calling tenant's POV: the *other* party. */
  counterparty: {
    name: string;
    /** Slug for company; null for student (we don't expose student slugs publicly). */
    companySlug: string | null;
  };
  lastMessage: {
    body: string;
    senderRole: "STUDENT" | "COMPANY";
    createdAt: Date;
  } | null;
  updatedAt: Date;
  unreadForViewer: number;
};

export type ThreadDetail = {
  threadId: string;
  applicationId: string;
  applicationStatus: ApplicationStatus;
  /**
   * True iff the underlying application is in a terminal state
   * (REJECTED or WITHDRAWN). Both sides can still read the thread,
   * but new sends are rejected at the service layer.
   */
  threadClosed: boolean;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
  };
  counterparty: {
    name: string;
    companySlug: string | null;
  };
  /**
   * Whether the viewer is allowed to send into this thread right now.
   * False when the thread is closed OR (for students) when no company
   * has initiated the thread yet.
   */
  canReply: boolean;
  messages: Array<{
    id: string;
    body: string;
    senderRole: "STUDENT" | "COMPANY";
    senderUserId: string;
    createdAt: Date;
    readAt: Date | null;
  }>;
};

const MAX_BODY_LEN = 4000;

function clean(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

// ---------- Tenant identity resolvers ----------

async function resolveStudent(userId: string) {
  return prisma.studentProfile.findFirst({
    where: { user: { id: userId, role: "STUDENT", deletedAt: null } },
    select: { id: true, fullName: true },
  });
}

async function resolveCompany(userId: string) {
  return prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, companyName: true, slug: true },
  });
}

/**
 * Tenant-side parent-row visibility. A thread is invisible (read AND
 * write) once any of its parents has been soft-deleted: the posting,
 * the owning company, or the student's user account. Historical rows
 * still live in the DB for /admin/* and audit, but normal app surfaces
 * exclude them.
 *
 * Mirrors application-service.listApplicationsForCompany — keep these
 * predicates aligned if either side changes.
 */
const APPLICATION_PARENTS_LIVE = {
  jobPosting: { deletedAt: null, companyProfile: { deletedAt: null } },
  studentProfile: { user: { deletedAt: null } },
} as const;

/**
 * Post-commit notifier. Resolves the recipient based on sender role
 * (a student-sent message notifies the company; a company-sent
 * message notifies the student) and dispatches via email-service.
 * Best-effort — failures are absorbed by `dispatchEmail`.
 */
async function notifyNewMessage(args: {
  threadId: string;
  senderRole: "STUDENT" | "COMPANY";
  body: string;
}): Promise<void> {
  const ctx = await prisma.messageThread.findUnique({
    where: { id: args.threadId },
    select: {
      application: {
        select: {
          jobPosting: {
            select: {
              title: true,
              companyProfile: {
                select: {
                  contactEmail: true,
                  user: { select: { email: true, deletedAt: true } },
                },
              },
            },
          },
          studentProfile: {
            select: { user: { select: { email: true, deletedAt: true } } },
          },
        },
      },
    },
  });
  if (!ctx) return;

  if (args.senderRole === "STUDENT") {
    const co = ctx.application.jobPosting.companyProfile;
    const recipient =
      co.contactEmail ?? (co.user.deletedAt === null ? co.user.email : null);
    if (!recipient) return;
    await dispatchEmail(
      newMessage({
        to: recipient,
        recipientRole: "COMPANY",
        jobTitle: ctx.application.jobPosting.title,
        threadId: args.threadId,
        preview: args.body,
      }),
    );
  } else {
    const stud = ctx.application.studentProfile.user;
    if (stud.deletedAt !== null) return;
    await dispatchEmail(
      newMessage({
        to: stud.email,
        recipientRole: "STUDENT",
        jobTitle: ctx.application.jobPosting.title,
        threadId: args.threadId,
        preview: args.body,
      }),
    );
  }
}

// ---------- Reads ----------

export async function listThreadsForStudent(
  studentUserId: string,
): Promise<ThreadListItem[]> {
  const profile = await resolveStudent(studentUserId);
  if (!profile) return [];

  const threads = await prisma.messageThread.findMany({
    where: {
      application: {
        studentProfileId: profile.id,
        ...APPLICATION_PARENTS_LIVE,
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          status: true,
          jobPosting: {
            select: {
              id: true,
              title: true,
              slug: true,
              companyProfile: { select: { companyName: true, slug: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          senderUser: { select: { role: true } },
        },
      },
      _count: {
        select: {
          messages: {
            where: {
              readAt: null,
              senderUser: { role: { not: "STUDENT" } },
            },
          },
        },
      },
    },
  });

  return threads.map((t) => {
    const last = t.messages[0];
    return {
      threadId: t.id,
      applicationId: t.application.id,
      applicationStatus: t.application.status,
      jobPosting: {
        id: t.application.jobPosting.id,
        title: t.application.jobPosting.title,
        jobSlug: t.application.jobPosting.slug,
      },
      counterparty: {
        name: t.application.jobPosting.companyProfile.companyName,
        companySlug: t.application.jobPosting.companyProfile.slug,
      },
      lastMessage: last
        ? {
            body: last.body,
            senderRole: last.senderUser.role as "STUDENT" | "COMPANY",
            createdAt: last.createdAt,
          }
        : null,
      updatedAt: t.updatedAt,
      unreadForViewer: t._count.messages,
    };
  });
}

export async function listThreadsForCompany(
  companyUserId: string,
): Promise<ThreadListItem[]> {
  const company = await resolveCompany(companyUserId);
  if (!company) return [];

  const threads = await prisma.messageThread.findMany({
    where: {
      application: {
        jobPosting: { companyProfileId: company.id, deletedAt: null },
        studentProfile: { user: { deletedAt: null } },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          status: true,
          jobPosting: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          studentProfile: { select: { fullName: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          senderUser: { select: { role: true } },
        },
      },
      _count: {
        select: {
          messages: {
            where: {
              readAt: null,
              senderUser: { role: { not: "COMPANY" } },
            },
          },
        },
      },
    },
  });

  return threads.map((t) => {
    const last = t.messages[0];
    return {
      threadId: t.id,
      applicationId: t.application.id,
      applicationStatus: t.application.status,
      jobPosting: {
        id: t.application.jobPosting.id,
        title: t.application.jobPosting.title,
        jobSlug: t.application.jobPosting.slug,
      },
      counterparty: {
        name: t.application.studentProfile.fullName,
        companySlug: null,
      },
      lastMessage: last
        ? {
            body: last.body,
            senderRole: last.senderUser.role as "STUDENT" | "COMPANY",
            createdAt: last.createdAt,
          }
        : null,
      updatedAt: t.updatedAt,
      unreadForViewer: t._count.messages,
    };
  });
}

/**
 * Read a single thread + its messages. Returns null on any tenant
 * mismatch — callers map that to a 404. Marks counterparty messages
 * as read in the same call (read-as-load).
 */
export async function getThreadForStudent(
  studentUserId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const profile = await resolveStudent(studentUserId);
  if (!profile) return null;

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      application: {
        studentProfileId: profile.id,
        ...APPLICATION_PARENTS_LIVE,
      },
    },
    select: {
      id: true,
      initiatedByUserId: true,
      application: {
        select: {
          id: true,
          status: true,
          jobPosting: {
            select: {
              id: true,
              title: true,
              slug: true,
              companyProfile: { select: { companyName: true, slug: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          senderUserId: true,
          readAt: true,
          createdAt: true,
          senderUser: { select: { role: true } },
        },
      },
    },
  });
  if (!thread) return null;

  // Mark unread company-side messages as read for the student viewer.
  await prisma.message.updateMany({
    where: {
      threadId: thread.id,
      readAt: null,
      senderUser: { role: { not: "STUDENT" } },
    },
    data: { readAt: new Date() },
  });

  // A student can reply only if a company already initiated this
  // thread AND the application isn't in a terminal state. Pin both
  // checks server-side; the UI hint is convenience only.
  const closed = isClosed(thread.application.status);
  const canReply = !closed && thread.initiatedByUserId !== studentUserId;

  return {
    threadId: thread.id,
    applicationId: thread.application.id,
    applicationStatus: thread.application.status,
    threadClosed: closed,
    jobPosting: {
      id: thread.application.jobPosting.id,
      title: thread.application.jobPosting.title,
      jobSlug: thread.application.jobPosting.slug,
    },
    counterparty: {
      name: thread.application.jobPosting.companyProfile.companyName,
      companySlug: thread.application.jobPosting.companyProfile.slug,
    },
    canReply,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderRole: m.senderUser.role as "STUDENT" | "COMPANY",
      senderUserId: m.senderUserId,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
}

export async function getThreadForCompany(
  companyUserId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const company = await resolveCompany(companyUserId);
  if (!company) return null;

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      application: {
        jobPosting: { companyProfileId: company.id, deletedAt: null },
        studentProfile: { user: { deletedAt: null } },
      },
    },
    select: {
      id: true,
      application: {
        select: {
          id: true,
          status: true,
          jobPosting: { select: { id: true, title: true, slug: true } },
          studentProfile: { select: { fullName: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          senderUserId: true,
          readAt: true,
          createdAt: true,
          senderUser: { select: { role: true } },
        },
      },
    },
  });
  if (!thread) return null;

  await prisma.message.updateMany({
    where: {
      threadId: thread.id,
      readAt: null,
      senderUser: { role: { not: "COMPANY" } },
    },
    data: { readAt: new Date() },
  });

  const closed = isClosed(thread.application.status);

  return {
    threadId: thread.id,
    applicationId: thread.application.id,
    applicationStatus: thread.application.status,
    threadClosed: closed,
    jobPosting: {
      id: thread.application.jobPosting.id,
      title: thread.application.jobPosting.title,
      jobSlug: thread.application.jobPosting.slug,
    },
    counterparty: {
      name: thread.application.studentProfile.fullName,
      companySlug: null,
    },
    canReply: !closed,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderRole: m.senderUser.role as "STUDENT" | "COMPANY",
      senderUserId: m.senderUserId,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
}

// ---------- Writes ----------

/**
 * Company-initiated thread creation. Wraps thread create + first
 * message + activity event in a single transaction so the audit
 * trail can't get out of sync with reality.
 */
export async function startThreadAsCompany(
  companyUserId: string,
  applicationId: string,
  body: string,
): Promise<StartThreadResult> {
  const cleaned = clean(body);
  if (cleaned.length === 0 || cleaned.length > MAX_BODY_LEN) {
    return { ok: false, reason: "empty" };
  }

  const company = await resolveCompany(companyUserId);
  if (!company) return { ok: false, reason: "forbidden" };

  // The application must belong to one of this company's postings,
  // and all parents (posting, student-user) must still be live —
  // otherwise the company can't usefully start a thread.
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      jobPosting: { companyProfileId: company.id, deletedAt: null },
      studentProfile: { user: { deletedAt: null } },
    },
    select: { id: true, status: true },
  });
  if (!application) return { ok: false, reason: "forbidden" };
  if (isClosed(application.status)) {
    return { ok: false, reason: "thread_closed" };
  }

  // Idempotency: if a thread already exists for this application,
  // reuse it rather than creating a duplicate. Keeps the inbox clean.
  const existing = await prisma.messageThread.findFirst({
    where: { applicationId: application.id },
    select: { id: true },
  });

  if (existing) {
    const [, message] = await prisma.$transaction([
      prisma.messageThread.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      }),
      prisma.message.create({
        data: {
          threadId: existing.id,
          senderUserId: companyUserId,
          body: cleaned,
        },
        select: { id: true },
      }),
    ]);
    await notifyNewMessage({
      threadId: existing.id,
      senderRole: "COMPANY",
      body: cleaned,
    });
    return { ok: true, threadId: existing.id, messageId: message.id };
  }

  const [thread, message] = await prisma.$transaction(async (tx) => {
    const t = await tx.messageThread.create({
      data: {
        applicationId: application.id,
        initiatedByUserId: companyUserId,
      },
      select: { id: true },
    });
    const m = await tx.message.create({
      data: {
        threadId: t.id,
        senderUserId: companyUserId,
        body: cleaned,
      },
      select: { id: true },
    });
    await tx.activityEvent.create({
      data: {
        type: "MESSAGE_THREAD_CREATED",
        actorUserId: companyUserId,
        entityType: "MessageThread",
        entityId: t.id,
        metadataJson: { applicationId: application.id },
      },
    });
    return [t, m] as const;
  });

  await notifyNewMessage({
    threadId: thread.id,
    senderRole: "COMPANY",
    body: cleaned,
  });

  return { ok: true, threadId: thread.id, messageId: message.id };
}

/**
 * Student reply. Forbidden unless a thread exists tied to one of the
 * student's own applications, AND the thread was initiated by someone
 * other than the student themselves (CLAUDE.md: students cannot start
 * threads). The schema currently disallows student-initiated threads
 * upstream, but the second check pins the rule at the writer too.
 */
export async function sendMessageAsStudent(
  studentUserId: string,
  threadId: string,
  body: string,
): Promise<SendMessageResult> {
  const cleaned = clean(body);
  if (cleaned.length === 0 || cleaned.length > MAX_BODY_LEN) {
    return { ok: false, reason: "empty" };
  }

  const profile = await resolveStudent(studentUserId);
  if (!profile) return { ok: false, reason: "forbidden" };

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      application: {
        studentProfileId: profile.id,
        ...APPLICATION_PARENTS_LIVE,
      },
    },
    select: {
      id: true,
      initiatedByUserId: true,
      application: { select: { status: true } },
    },
  });
  if (!thread) return { ok: false, reason: "forbidden" };

  if (thread.initiatedByUserId === studentUserId) {
    return { ok: false, reason: "students_cannot_initiate" };
  }
  if (isClosed(thread.application.status)) {
    return { ok: false, reason: "thread_closed" };
  }

  const [, message] = await prisma.$transaction([
    prisma.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    }),
    prisma.message.create({
      data: {
        threadId: thread.id,
        senderUserId: studentUserId,
        body: cleaned,
      },
      select: { id: true },
    }),
  ]);

  await notifyNewMessage({
    threadId: thread.id,
    senderRole: "STUDENT",
    body: cleaned,
  });

  return { ok: true, messageId: message.id };
}

/**
 * Company reply. The thread must belong to one of the company's
 * postings; the cross-tenant case collapses to `forbidden`.
 */
export async function sendMessageAsCompany(
  companyUserId: string,
  threadId: string,
  body: string,
): Promise<SendMessageResult> {
  const cleaned = clean(body);
  if (cleaned.length === 0 || cleaned.length > MAX_BODY_LEN) {
    return { ok: false, reason: "empty" };
  }

  const company = await resolveCompany(companyUserId);
  if (!company) return { ok: false, reason: "forbidden" };

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      application: {
        jobPosting: { companyProfileId: company.id, deletedAt: null },
        studentProfile: { user: { deletedAt: null } },
      },
    },
    select: {
      id: true,
      application: { select: { status: true } },
    },
  });
  if (!thread) return { ok: false, reason: "forbidden" };
  if (isClosed(thread.application.status)) {
    return { ok: false, reason: "thread_closed" };
  }

  const [, message] = await prisma.$transaction([
    prisma.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    }),
    prisma.message.create({
      data: {
        threadId: thread.id,
        senderUserId: companyUserId,
        body: cleaned,
      },
      select: { id: true },
    }),
  ]);

  await notifyNewMessage({
    threadId: thread.id,
    senderRole: "COMPANY",
    body: cleaned,
  });

  return { ok: true, messageId: message.id };
}

/**
 * Total unread messages addressed to the calling student across all
 * their threads. "Unread for student" = sender is not a student AND
 * `readAt` is null. Returns 0 for non-students or missing profiles.
 *
 * Used by the global nav badge — keep it cheap (a single COUNT, not
 * a full thread fetch).
 */
export async function countUnreadForStudent(
  studentUserId: string,
): Promise<number> {
  const profile = await resolveStudent(studentUserId);
  if (!profile) return 0;
  return prisma.message.count({
    where: {
      readAt: null,
      senderUser: { role: { not: "STUDENT" } },
      thread: {
        application: {
          studentProfileId: profile.id,
          ...APPLICATION_PARENTS_LIVE,
        },
      },
    },
  });
}

/**
 * Total unread messages addressed to the calling company across all
 * threads on its postings.
 */
export async function countUnreadForCompany(
  companyUserId: string,
): Promise<number> {
  const company = await resolveCompany(companyUserId);
  if (!company) return 0;
  return prisma.message.count({
    where: {
      readAt: null,
      senderUser: { role: { not: "COMPANY" } },
      thread: {
        application: {
          jobPosting: { companyProfileId: company.id, deletedAt: null },
          studentProfile: { user: { deletedAt: null } },
        },
      },
    },
  });
}

/**
 * Helper for the company applicant-row UI: does this company already
 * have a thread for this application? Used to switch the button
 * between "Start conversation" and "Open thread".
 */
export async function getThreadIdForApplicationAsCompany(
  companyUserId: string,
  applicationId: string,
): Promise<string | null> {
  const company = await resolveCompany(companyUserId);
  if (!company) return null;
  const thread = await prisma.messageThread.findFirst({
    where: {
      applicationId,
      application: {
        jobPosting: { companyProfileId: company.id, deletedAt: null },
        studentProfile: { user: { deletedAt: null } },
      },
    },
    select: { id: true },
  });
  return thread?.id ?? null;
}
