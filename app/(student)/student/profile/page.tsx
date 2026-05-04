import { requireRole } from "@/lib/auth/guards";
import { calculateCompleteness } from "@/lib/students/completeness";
import { getStudentProfileByUserId } from "@/server/services/student-service";

import { CompletenessMeter } from "@/features/students/completeness-meter";
import { ExperiencesSection } from "@/features/students/experiences-section";
import {
  ProfileBasicsForm,
  type ProfileBasicsDefaults,
} from "@/features/students/profile-basics-form";
import { ProjectsSection } from "@/features/students/projects-section";
import { ResumeSection } from "@/features/students/resume-section";
import { SkillsSection } from "@/features/students/skills-section";

export const metadata = {
  title: "Your student profile",
};

const EMPTY_DEFAULTS: ProfileBasicsDefaults = {
  fullName: "",
  headline: "",
  university: "",
  graduationYear: "",
  degree: "",
  major: "",
  location: "",
  workAuthorization: "",
  bio: "",
  portfolioUrl: "",
  linkedinUrl: "",
  githubUrl: "",
  programTag: "",
};

export default async function StudentProfilePage() {
  const user = await requireRole("STUDENT");
  const profile = await getStudentProfileByUserId(user.id);

  const defaults: ProfileBasicsDefaults = profile
    ? {
        fullName: profile.fullName ?? "",
        headline: profile.headline ?? "",
        university: profile.university ?? "",
        graduationYear:
          profile.graduationYear != null ? String(profile.graduationYear) : "",
        degree: profile.degree ?? "",
        major: profile.major ?? "",
        location: profile.location ?? "",
        workAuthorization: profile.workAuthorization ?? "",
        bio: profile.bio ?? "",
        portfolioUrl: profile.portfolioUrl ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
        githubUrl: profile.githubUrl ?? "",
        programTag: profile.programTag ?? "",
      }
    : EMPTY_DEFAULTS;

  const completeness = calculateCompleteness({
    fullName: profile?.fullName ?? null,
    headline: profile?.headline ?? null,
    university: profile?.university ?? null,
    graduationYear: profile?.graduationYear ?? null,
    degree: profile?.degree ?? null,
    major: profile?.major ?? null,
    location: profile?.location ?? null,
    workAuthorization: profile?.workAuthorization ?? null,
    bio: profile?.bio ?? null,
    resumeStorageKey: profile?.resumeStorageKey ?? null,
    skillCount: profile?.skills.length ?? 0,
    experienceCount: profile?.experiences.length ?? 0,
    projectCount: profile?.projects.length ?? 0,
  });

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto w-full max-w-4xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Student profile
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile?.fullName ? `${profile.fullName}'s profile` : "Your profile"}
        </h1>
        <p className="text-muted-foreground">
          Companies see what you put here when you apply. Save changes any time
          — sections update independently.
        </p>
      </header>

      <div className="mx-auto w-full max-w-4xl">
        <CompletenessMeter completeness={completeness} />
      </div>

      <Section
        title="Basics"
        description="Identity, school, and the headline that introduces you."
      >
        <ProfileBasicsForm defaults={defaults} />
      </Section>

      <Section
        title="Resume"
        description="Stored privately. Only you (and companies you apply to) can read it."
      >
        <ResumeSection currentKey={profile?.resumeStorageKey ?? null} />
      </Section>

      <Section
        title="Skills"
        description="Free-form tags. Aim for 5–10 you'd happily talk about."
      >
        <SkillsSection
          items={(profile?.skills ?? []).map((s) => ({
            id: s.id,
            name: s.name,
          }))}
        />
      </Section>

      <Section
        title="Experiences"
        description="Roles, internships, research, or relevant volunteer work."
      >
        <ExperiencesSection
          items={(profile?.experiences ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            organization: e.organization,
            startDate: e.startDate,
            endDate: e.endDate,
            description: e.description,
          }))}
        />
      </Section>

      <Section
        title="Projects"
        description="Class projects, side projects, or anything you built and want to show off."
      >
        <ProjectsSection
          items={(profile?.projects ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            url: p.url,
            description: p.description,
          }))}
        />
      </Section>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 rounded-lg border border-border bg-card p-6">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
