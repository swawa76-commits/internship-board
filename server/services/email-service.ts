import "server-only";

import { email as defaultAdapter } from "@/server/adapters/email";
import type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "@/server/adapters/email";

/**
 * Email service. Owns:
 *   - Template/payload construction for every notification trigger.
 *   - The "safe-fire" wrapper that guarantees an adapter failure
 *     never bubbles into the caller's try/catch and never rolls back
 *     a primary mutation.
 *
 * Architectural rules (Task 18):
 *   - Email is dispatched ONLY after the primary mutation has
 *     committed. Callers run the DB transaction first, observe its
 *     success, THEN call into here.
 *   - Email dispatch must never reside inside `prisma.$transaction`.
 *     The transaction would hold an open connection while we wait on
 *     a network round-trip; a timeout there would actually roll back
 *     the primary mutation we want to preserve.
 *   - Provider failures are caught, logged, and silently absorbed.
 *     The caller never knows or cares whether the email landed.
 *   - For tests, `__setEmailAdapter` swaps in a fake collector.
 */

let activeAdapter: EmailAdapter = defaultAdapter;

/** Test-only seam. Production code should never call this. */
export function __setEmailAdapter(adapter: EmailAdapter): void {
  activeAdapter = adapter;
}

/** Test-only seam to restore the env-resolved adapter. */
export function __resetEmailAdapter(): void {
  activeAdapter = defaultAdapter;
}

export function getActiveEmailAdapter(): EmailAdapter {
  return activeAdapter;
}

/**
 * Fire-and-log dispatch. Returns the adapter's Result for tests/
 * callers that genuinely care (most don't). Wraps both adapter
 * exceptions AND `{ ok: false }` results in a uniform log line so
 * provider failures never propagate.
 */
export async function dispatchEmail(
  message: EmailMessage,
): Promise<EmailSendResult> {
  try {
    const result = await activeAdapter.send(message);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[email] provider=${result.provider} failed to send to=${message.to} subject="${message.subject}": ${result.error}`,
      );
    }
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[email] adapter threw while sending to=${message.to} subject="${message.subject}": ${error}`,
    );
    return {
      ok: false,
      provider: activeAdapter.providerName,
      error,
    };
  }
}

// ---------- Templates ----------

export type StudentWelcomeInput = { to: string; userId: string };
export function studentWelcome(input: StudentWelcomeInput): EmailMessage {
  return {
    to: input.to,
    subject: "Welcome to InternshipBoard",
    body:
      `Welcome!\n\n` +
      `Your student account is set up. Finish your profile to start applying:\n` +
      `  /student/profile\n\n` +
      `Once your profile is complete, you can browse and apply to internships at /jobs.`,
    metadata: { kind: "student_welcome", userId: input.userId },
  };
}

export type CompanyWelcomeInput = { to: string; userId: string; companyName?: string };
export function companyWelcome(input: CompanyWelcomeInput): EmailMessage {
  const name = input.companyName ?? "your company";
  return {
    to: input.to,
    subject: "Welcome to InternshipBoard",
    body:
      `Welcome!\n\n` +
      `${name} now has a company account. The next steps:\n` +
      `  1. Finish your company profile (/company/profile)\n` +
      `  2. Wait for admin approval (you can still draft postings while pending)\n` +
      `  3. Once approved, publish postings to start receiving applicants\n`,
    metadata: { kind: "company_welcome", userId: input.userId },
  };
}

export type AdminCompanyPendingInput = {
  to: string;
  companyName: string;
  companyProfileId: string;
};
export function adminCompanyPending(
  input: AdminCompanyPendingInput,
): EmailMessage {
  return {
    to: input.to,
    subject: `New company awaiting approval: ${input.companyName}`,
    body:
      `${input.companyName} just signed up and is in PENDING state.\n\n` +
      `Review and approve/suspend at /admin/companies\n` +
      `Profile id: ${input.companyProfileId}\n`,
    metadata: {
      kind: "admin_company_pending",
      companyProfileId: input.companyProfileId,
    },
  };
}

export type CompanyApprovalChangedInput = {
  to: string;
  companyName: string;
  newStatus: "APPROVED" | "PENDING" | "SUSPENDED";
};
export function companyApprovalChanged(
  input: CompanyApprovalChangedInput,
): EmailMessage {
  const subjectMap: Record<typeof input.newStatus, string> = {
    APPROVED: "Your company is approved",
    PENDING: "Your company is back in pending review",
    SUSPENDED: "Your company has been suspended",
  };
  const bodyMap: Record<typeof input.newStatus, string> = {
    APPROVED:
      `Good news — ${input.companyName} is approved.\n\n` +
      `You can now publish postings, and they'll be visible at /jobs immediately.`,
    PENDING:
      `${input.companyName} is currently in PENDING review.\n\n` +
      `You can keep editing your profile and drafting postings; published postings stay hidden until you're back to APPROVED.`,
    SUSPENDED:
      `${input.companyName} has been suspended by an admin.\n\n` +
      `Your published postings are hidden from the public board until the suspension is lifted.`,
  };
  return {
    to: input.to,
    subject: subjectMap[input.newStatus],
    body: bodyMap[input.newStatus],
    metadata: {
      kind: "company_approval_changed",
      newStatus: input.newStatus,
    },
  };
}

export type StudentApplicationStatusChangedInput = {
  to: string;
  studentName: string;
  jobTitle: string;
  companyName: string;
  newStatus:
    | "APPLIED"
    | "IN_REVIEW"
    | "INTERVIEWING"
    | "OFFER"
    | "REJECTED"
    | "WITHDRAWN";
  applicationId: string;
};
export function studentApplicationStatusChanged(
  input: StudentApplicationStatusChangedInput,
): EmailMessage {
  const friendly: Record<typeof input.newStatus, string> = {
    APPLIED: "Applied",
    IN_REVIEW: "In review",
    INTERVIEWING: "Interviewing",
    OFFER: "Offer",
    REJECTED: "Not moving forward",
    WITHDRAWN: "Withdrawn",
  };
  return {
    to: input.to,
    subject: `${input.companyName} — ${friendly[input.newStatus]}: ${input.jobTitle}`,
    body:
      `Hi ${input.studentName},\n\n` +
      `Your application to ${input.companyName} for "${input.jobTitle}" is now ${friendly[input.newStatus]}.\n\n` +
      `Open your applications at /student/applications.`,
    metadata: {
      kind: "student_application_status_changed",
      newStatus: input.newStatus,
      applicationId: input.applicationId,
    },
  };
}

export type CompanyApplicationReceivedInput = {
  to: string;
  companyName: string;
  studentName: string;
  jobTitle: string;
  applicationId: string;
};
export function companyApplicationReceived(
  input: CompanyApplicationReceivedInput,
): EmailMessage {
  return {
    to: input.to,
    subject: `New applicant for ${input.jobTitle}`,
    body:
      `${input.studentName} just applied to "${input.jobTitle}" at ${input.companyName}.\n\n` +
      `Review and respond at /company/applications.`,
    metadata: {
      kind: "company_application_received",
      applicationId: input.applicationId,
    },
  };
}

export type NewMessageInput = {
  to: string;
  recipientRole: "STUDENT" | "COMPANY";
  jobTitle: string;
  threadId: string;
  preview: string;
};
export function newMessage(input: NewMessageInput): EmailMessage {
  const path =
    input.recipientRole === "STUDENT"
      ? `/student/messages/${input.threadId}`
      : `/company/messages/${input.threadId}`;
  return {
    to: input.to,
    subject: `New message about ${input.jobTitle}`,
    body:
      `You have a new message about "${input.jobTitle}".\n\n` +
      `Preview: ${input.preview.slice(0, 200)}\n\n` +
      `Open the thread at ${path}.`,
    metadata: {
      kind: "new_message",
      threadId: input.threadId,
    },
  };
}
