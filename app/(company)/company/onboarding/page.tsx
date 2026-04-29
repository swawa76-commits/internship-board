import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { CompanyOnboardingWelcome } from "@/features/companies/onboarding-welcome";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { needsCompanyOnboarding } from "@/server/services/onboarding-service";

export const metadata = {
  title: "Welcome to your company profile",
};

export default async function CompanyOnboardingPage() {
  const user = await requireRole("COMPANY");

  // If the company has already completed onboarding, send them to their
  // dashboard. They can still edit the profile from there.
  const stillNeeds = await needsCompanyOnboarding(user.id);
  if (!stillNeeds) {
    redirect("/company/dashboard");
  }

  const [profile, approvalStatus] = await Promise.all([
    prisma.companyProfile.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    }),
    getFreshCompanyApprovalStatus(user.id),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-end">
        <LogoutButton />
      </header>
      <CompanyOnboardingWelcome
        email={user.email ?? "your account"}
        hasProfile={profile != null}
        approvalStatus={approvalStatus}
      />
    </main>
  );
}
