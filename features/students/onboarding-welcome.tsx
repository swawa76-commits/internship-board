import Link from "next/link";

import { Button } from "@/components/ui/button";

export type StudentOnboardingWelcomeProps = {
  email: string;
  hasProfile: boolean;
};

/**
 * Welcome panel for the student onboarding flow. The actual profile form
 * is built in Task 6 — this just sets the structural layout, copy, and
 * empty-state cues so a freshly-signed-up student knows what's next.
 */
export function StudentOnboardingWelcome({
  email,
  hasProfile,
}: StudentOnboardingWelcomeProps) {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step 1 of 1
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome! Let&apos;s build your student profile.
        </h1>
        <p className="text-muted-foreground">
          Signed in as {email}. A complete profile is required before you can
          apply to internships.
        </p>
      </header>

      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-1 block size-1.5 rounded-full bg-foreground" />
          {hasProfile
            ? "Pick up where you left off and finish the remaining sections."
            : "Tell us a little about yourself — name, school, and what you're studying."}
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-1 block size-1.5 rounded-full bg-foreground" />
          Add the skills, experiences, and projects you&apos;d like companies
          to see.
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-1 block size-1.5 rounded-full bg-foreground" />
          Upload your resume so we can attach it to applications.
        </li>
      </ul>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button asChild size="lg">
          {/*
           * The actual form lives at /student/profile, built in Task 6.
           * Until then this link is the explicit hand-off point.
           */}
          <Link href="/student/profile">
            {hasProfile ? "Resume profile" : "Start profile"}
          </Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/jobs">Browse internships first</Link>
        </Button>
      </div>
    </section>
  );
}
