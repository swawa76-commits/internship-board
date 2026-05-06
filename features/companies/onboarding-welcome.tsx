import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

export type CompanyOnboardingWelcomeProps = {
  email: string;
  hasProfile: boolean;
  approvalStatus: CompanyApprovalStatus | null;
};

const APPROVAL_BLURB: Record<CompanyApprovalStatus, string> = {
  PENDING:
    "Your profile is queued for PCI review. You can keep drafting job postings while you wait — they'll go live the moment you're approved.",
  APPROVED:
    "You're approved. Anything you publish will be visible to students immediately.",
  SUSPENDED:
    "Your account is currently suspended. Existing job postings are hidden from students until PCI reinstates the account.",
};

/**
 * Welcome panel for the company onboarding flow. The actual profile form
 * is built in Task 7 — this sets the structural layout, copy, empty-state
 * cues, and the contextual approval-status messaging that CLAUDE.md asks
 * for ("Clear status messaging if approval is pending").
 */
export function CompanyOnboardingWelcome({
  email,
  hasProfile,
  approvalStatus,
}: CompanyOnboardingWelcomeProps) {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step 1 of 1
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome! Let&apos;s set up your company profile.
        </h1>
        <p className="text-muted-foreground">
          Signed in as {email}. Once your profile is in place you&apos;ll be
          able to draft and publish internship postings.
        </p>
      </header>

      {approvalStatus ? (
        <div
          role="status"
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium text-foreground">
            Approval status: <span className="font-mono">{approvalStatus}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            {APPROVAL_BLURB[approvalStatus]}
          </p>
        </div>
      ) : null}

      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1 block size-1.5 rounded-full bg-foreground"
          />
          {hasProfile
            ? "Fill in the remaining company details so students can learn what you do."
            : "Add your company name, industry, and a short description."}
        </li>
        <li className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1 block size-1.5 rounded-full bg-foreground"
          />
          Upload a logo to make postings recognizable in the public list.
        </li>
        <li className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1 block size-1.5 rounded-full bg-foreground"
          />
          Draft your first internship posting. It can stay as a draft until
          you&apos;re approved.
        </li>
      </ul>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button asChild size="lg">
          {/*
           * The actual form lives at /company/profile, built in Task 7.
           * Until then this link is the explicit hand-off point.
           */}
          <Link href="/company/profile">
            {hasProfile ? "Resume profile" : "Start profile"}
          </Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/company/dashboard">Skip for now</Link>
        </Button>
      </div>
    </section>
  );
}
