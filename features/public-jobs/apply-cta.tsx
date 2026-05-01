import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/features/applications/apply-form";
import { getSessionUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

/**
 * Apply CTA. Behavior depends on the visitor:
 *  - Anonymous: a clear "Log in / sign up to apply" affordance.
 *  - Logged-in STUDENT: an inline cover-letter textarea + Submit button.
 *      Sub-state: if they've already applied to this posting, show
 *      "You've already applied" instead of the form.
 *      Sub-state: if their profile is incomplete, link them to the
 *      profile form rather than letting them submit-and-bounce.
 *  - Logged-in COMPANY or ADMIN: explanatory copy (apply is student-only).
 *
 * The actual rejection logic lives in the service and is the source of
 * truth — the UI hints here are just for friendlier UX.
 */
export async function ApplyCta({ jobPostingId }: { jobPostingId: string }) {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <Button asChild size="lg">
          <Link href={`/login?next=/jobs`}>Log in to apply</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium hover:underline">
            Create a student account
          </Link>
          .
        </p>
      </div>
    );
  }

  if (user.role !== "STUDENT") {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        Applying is for student accounts only.
      </div>
    );
  }

  // Student-specific status checks. We re-resolve fresh to avoid stale
  // session caching, and we don't trust the UI hints — the service is
  // the gate.
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, isProfileComplete: true, resumeStorageKey: true },
  });

  if (!profile || !profile.isProfileComplete) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        <p>Finish your profile before applying.</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/student/profile">Open your profile</Link>
        </Button>
      </div>
    );
  }

  // A resume is required to apply (Patch 2). Even if the profile is
  // marked complete, a missing resume blocks submission server-side
  // — guide the student to upload one before they hit submit.
  if (!profile.resumeStorageKey) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        <p>Upload a resume on your profile before applying.</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/student/profile">Upload resume</Link>
        </Button>
      </div>
    );
  }

  const existing = await prisma.application.findUnique({
    where: {
      jobPostingId_studentProfileId: {
        jobPostingId,
        studentProfileId: profile.id,
      },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        <p>
          You&apos;ve already applied to this posting. Status:{" "}
          <span className="font-mono text-xs">{existing.status}</span>
        </p>
        <Button asChild size="sm" className="mt-3" variant="outline">
          <Link href="/student/applications">View your applications</Link>
        </Button>
      </div>
    );
  }

  return <ApplyForm jobPostingId={jobPostingId} />;
}
