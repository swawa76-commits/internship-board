import "server-only";

import { calculateCompanyCompleteness } from "@/lib/companies/completeness";
import { prisma } from "@/lib/db/client";
import type { UserRole } from "@/lib/db/generated/enums";

/**
 * Onboarding decisions live in the service layer, not in route components
 * or Edge middleware:
 *  - Edge middleware can't reach Postgres (no Prisma on the Edge runtime)
 *  - Caching "profile complete?" in the JWT would go stale
 *  - Pages should not embed Prisma queries directly (ARCHITECTURE.md)
 *
 * The proxy enforces the role gate; these helpers tell the page layer
 * whether the just-passed-the-gate user needs onboarding.
 */

export type LandingTarget =
  | "/student/onboarding"
  | "/student/dashboard"
  | "/company/onboarding"
  | "/company/dashboard"
  | "/admin"
  | "/";

/**
 * True iff the student should be sent through onboarding rather than the
 * normal dashboard. The check is intentionally narrow:
 *  - no StudentProfile row, OR
 *  - the row exists but `isProfileComplete` is false.
 *
 * Soft-deleted profiles are treated as missing.
 */
export async function needsStudentOnboarding(userId: string): Promise<boolean> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { isProfileComplete: true },
  });
  if (!profile) return true;
  return !profile.isProfileComplete;
}

/**
 * True iff the company should be sent through onboarding rather than the
 * normal dashboard.
 *
 * The rule defers to `calculateCompanyCompleteness` so onboarding,
 * the dashboard self-redirect, and the completeness meter all agree
 * on a single contract.
 *
 * `approvalStatus` is intentionally NOT part of this check — a PENDING
 * company has finished onboarding; they're just waiting for admin
 * review. That state is surfaced on the dashboard itself.
 */
export async function needsCompanyOnboarding(userId: string): Promise<boolean> {
  const profile = await prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: {
      companyName: true,
      slug: true,
      industry: true,
      companySize: true,
      headquarters: true,
      shortDescription: true,
      description: true,
      contactEmail: true,
    },
  });
  if (!profile) return true;
  return !calculateCompanyCompleteness(profile).isComplete;
}

/**
 * Resolve the correct landing route for a given (role, userId). Used by
 * `/post-login` after sign-in and by `signupAction` after signup.
 *
 * Falls back to `/` for unknown shapes — defensive, not expected in
 * normal operation.
 */
export async function decideLandingFor(
  role: UserRole,
  userId: string,
): Promise<LandingTarget> {
  if (role === "ADMIN") return "/admin";
  if (role === "STUDENT") {
    return (await needsStudentOnboarding(userId))
      ? "/student/onboarding"
      : "/student/dashboard";
  }
  if (role === "COMPANY") {
    return (await needsCompanyOnboarding(userId))
      ? "/company/onboarding"
      : "/company/dashboard";
  }
  return "/";
}
