import "server-only";

import { prisma } from "@/lib/db/client";
import { calculateCompleteness } from "@/lib/students/completeness";
import type {
  ExperienceInput,
  ProfileBasicsInput,
  ProjectInput,
  SkillInput,
} from "@/features/students/schemas";

export type ServiceError =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" };

/**
 * Read the full profile + repeating sections by user id. Returns null
 * when the student has no profile row yet (still in onboarding).
 */
export async function getStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      skills: { orderBy: { name: "asc" } },
      experiences: { orderBy: { startDate: "desc" } },
      projects: { orderBy: { name: "asc" } },
    },
  });
}

/**
 * Recompute the `isProfileComplete` boolean and persist it. Called from
 * every mutation that could flip completeness. Returns the new state.
 */
export async function recomputeAndPersistCompleteness(
  studentProfileId: string,
): Promise<{ isComplete: boolean; percent: number }> {
  const [profile, skillCount, experienceCount, projectCount] =
    await Promise.all([
      prisma.studentProfile.findUnique({
        where: { id: studentProfileId },
        select: {
          fullName: true,
          headline: true,
          university: true,
          graduationYear: true,
          degree: true,
          major: true,
          location: true,
          workAuthorization: true,
          bio: true,
          resumeStorageKey: true,
        },
      }),
      prisma.studentSkill.count({ where: { studentProfileId } }),
      prisma.studentExperience.count({ where: { studentProfileId } }),
      prisma.studentProject.count({ where: { studentProfileId } }),
    ]);

  if (!profile) {
    throw new Error("Profile not found while recomputing completeness");
  }

  const result = calculateCompleteness({
    ...profile,
    skillCount,
    experienceCount,
    projectCount,
  });

  // Detect the rising-edge transition incomplete -> complete and emit
  // an audit event exactly once. Re-saving an already-complete profile
  // doesn't re-fire the event.
  const prior = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { isProfileComplete: true, userId: true },
  });

  await prisma.studentProfile.update({
    where: { id: studentProfileId },
    data: { isProfileComplete: result.isComplete },
  });

  if (prior && !prior.isProfileComplete && result.isComplete) {
    await prisma.activityEvent.create({
      data: {
        type: "STUDENT_PROFILE_COMPLETED",
        actorUserId: prior.userId,
        entityType: "StudentProfile",
        entityId: studentProfileId,
      },
    });
  }

  return { isComplete: result.isComplete, percent: result.percent };
}

/**
 * Create-or-update the basics section. Idempotent. Owner is determined
 * by the session userId — there is no `userId` parameter that would let
 * a caller spoof another user's profile.
 */
export async function upsertProfileBasics(
  userId: string,
  input: ProfileBasicsInput,
): Promise<{ studentProfileId: string }> {
  const existing = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (existing) {
    await prisma.studentProfile.update({
      where: { id: existing.id },
      data: input,
    });
    await recomputeAndPersistCompleteness(existing.id);
    return { studentProfileId: existing.id };
  }

  const created = await prisma.studentProfile.create({
    data: { userId, ...input },
    select: { id: true },
  });
  await recomputeAndPersistCompleteness(created.id);
  return { studentProfileId: created.id };
}

/**
 * Resolve the user's StudentProfile id, creating the row on the fly if
 * needed (with `fullName` as a placeholder so the not-null constraint
 * holds). Used by section actions (skills/experiences/projects/resume)
 * when a student manages a section before saving the basics form.
 */
async function ensureProfileId(userId: string): Promise<string> {
  const existing = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing.id;
  // Pull a sensible placeholder from the User row.
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  const created = await prisma.studentProfile.create({
    data: { userId, fullName: user.email.split("@")[0] },
    select: { id: true },
  });
  return created.id;
}

/**
 * Ownership guard for nested entities (skill / experience / project rows).
 * Returns the parent profile id on success.
 */
async function assertOwnsChild(
  userId: string,
  entity: "skill" | "experience" | "project",
  childId: string,
): Promise<string> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new Error("forbidden");

  if (entity === "skill") {
    const row = await prisma.studentSkill.findUnique({
      where: { id: childId },
      select: { studentProfileId: true },
    });
    if (!row || row.studentProfileId !== profile.id)
      throw new Error("forbidden");
  } else if (entity === "experience") {
    const row = await prisma.studentExperience.findUnique({
      where: { id: childId },
      select: { studentProfileId: true },
    });
    if (!row || row.studentProfileId !== profile.id)
      throw new Error("forbidden");
  } else {
    const row = await prisma.studentProject.findUnique({
      where: { id: childId },
      select: { studentProfileId: true },
    });
    if (!row || row.studentProfileId !== profile.id)
      throw new Error("forbidden");
  }

  return profile.id;
}

// ---------- Skills ----------

export async function addSkill(userId: string, input: SkillInput) {
  const profileId = await ensureProfileId(userId);
  await prisma.studentSkill.upsert({
    where: {
      studentProfileId_name: { studentProfileId: profileId, name: input.name },
    },
    update: {},
    create: { studentProfileId: profileId, name: input.name },
  });
  await recomputeAndPersistCompleteness(profileId);
}

export async function removeSkill(userId: string, skillId: string) {
  const profileId = await assertOwnsChild(userId, "skill", skillId);
  await prisma.studentSkill.delete({ where: { id: skillId } });
  await recomputeAndPersistCompleteness(profileId);
}

// ---------- Experiences ----------

export async function addExperience(
  userId: string,
  input: ExperienceInput,
): Promise<{ id: string }> {
  const profileId = await ensureProfileId(userId);
  const created = await prisma.studentExperience.create({
    data: { studentProfileId: profileId, ...input },
    select: { id: true },
  });
  await recomputeAndPersistCompleteness(profileId);
  return created;
}

export async function removeExperience(userId: string, experienceId: string) {
  const profileId = await assertOwnsChild(userId, "experience", experienceId);
  await prisma.studentExperience.delete({ where: { id: experienceId } });
  await recomputeAndPersistCompleteness(profileId);
}

// ---------- Projects ----------

export async function addProject(
  userId: string,
  input: ProjectInput,
): Promise<{ id: string }> {
  const profileId = await ensureProfileId(userId);
  const created = await prisma.studentProject.create({
    data: { studentProfileId: profileId, ...input },
    select: { id: true },
  });
  await recomputeAndPersistCompleteness(profileId);
  return created;
}

export async function removeProject(userId: string, projectId: string) {
  const profileId = await assertOwnsChild(userId, "project", projectId);
  await prisma.studentProject.delete({ where: { id: projectId } });
  await recomputeAndPersistCompleteness(profileId);
}

// ---------- Resume ----------

export async function setResumeStorageKey(userId: string, key: string | null) {
  const profileId = await ensureProfileId(userId);
  await prisma.studentProfile.update({
    where: { id: profileId },
    data: { resumeStorageKey: key },
  });
  await recomputeAndPersistCompleteness(profileId);
}

/**
 * Permission check used by the resume read route. A student can only
 * read their own resume. Companies / admins get broader access in later
 * tasks via separate permission rules; for Task 6, owner-only.
 */
export async function canStudentReadResume(
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { resumeStorageKey: true },
  });
  return profile?.resumeStorageKey === storageKey;
}
