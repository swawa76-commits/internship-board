import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

const COPY: Record<
  CompanyApprovalStatus,
  { label: string; tone: "muted" | "warn" | "ok"; body: string }
> = {
  APPROVED: {
    label: "Approved",
    tone: "ok",
    body: "Your account is approved. Anything you publish is visible to students immediately.",
  },
  PENDING: {
    label: "Pending review",
    tone: "muted",
    body: "An admin is reviewing your account. Job postings stay private until you're approved — you can keep drafting in the meantime.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "warn",
    body: "Your account is suspended. Existing postings are hidden from students until an admin reinstates the account.",
  },
};

const TONE_CLASSES: Record<"muted" | "warn" | "ok", string> = {
  muted: "border-border bg-muted/40 text-foreground",
  warn: "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground",
  ok: "border-border bg-card text-foreground",
};

/**
 * Inline status banner shown on the company dashboard. CLAUDE.md asks for
 * "clear status messaging if approval is pending"; this also covers the
 * APPROVED and SUSPENDED states.
 */
export function CompanyApprovalBanner({
  status,
}: {
  status: CompanyApprovalStatus;
}) {
  const copy = COPY[status];
  return (
    <div
      role="status"
      aria-label={`Company approval status: ${copy.label}`}
      className={`rounded-md border px-4 py-3 text-sm ${TONE_CLASSES[copy.tone]}`}
    >
      <p className="font-medium">Approval status: {copy.label}</p>
      <p className="mt-1 opacity-80">{copy.body}</p>
    </div>
  );
}
