import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { StudentOnboardingWelcome } from "@/features/students/onboarding-welcome";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { needsStudentOnboarding } from "@/server/services/onboarding-service";

export const metadata = {
  title: "Welcome to your student profile",
};

export default async function StudentOnboardingPage() {
  const user = await requireRole("STUDENT");

  // If the student has already completed onboarding, send them straight
  // to their dashboard — visiting /student/onboarding shouldn't undo it.
  const stillNeeds = await needsStudentOnboarding(user.id);
  if (!stillNeeds) {
    redirect("/student/dashboard");
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-end">
        <LogoutButton />
      </header>
      <StudentOnboardingWelcome
        email={user.email ?? "your account"}
        hasProfile={profile != null}
      />
    </main>
  );
}
