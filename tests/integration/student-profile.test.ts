// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { createUserWithCredentials } from "@/server/services/auth-service";
import {
  addExperience,
  addProject,
  addSkill,
  canStudentReadResume,
  getStudentProfileByUserId,
  removeExperience,
  removeProject,
  removeSkill,
  setResumeStorageKey,
  upsertProfileBasics,
} from "@/server/services/student-service";

const RUN_ID = `sp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

async function makeStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  return r.userId;
}

const FULL_BASICS = {
  fullName: "Test Student",
  headline: "Aspiring backend engineer",
  university: "State University",
  graduationYear: 2027,
  degree: "B.S.",
  major: "Computer Science",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "I love building reliable systems.",
  portfolioUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  programTag: null,
};

describe.skipIf(skip)("student-service · upsertProfileBasics", () => {
  it("creates a profile when none exists", async () => {
    const userId = await makeStudent("create-basics");

    const before = await getStudentProfileByUserId(userId);
    expect(before).toBeNull();

    await upsertProfileBasics(userId, FULL_BASICS);

    const after = await getStudentProfileByUserId(userId);
    expect(after).not.toBeNull();
    expect(after?.fullName).toBe("Test Student");
    expect(after?.major).toBe("Computer Science");
  });

  it("updates an existing profile in place", async () => {
    const userId = await makeStudent("update-basics");
    await upsertProfileBasics(userId, FULL_BASICS);
    await upsertProfileBasics(userId, {
      ...FULL_BASICS,
      headline: "New headline",
    });
    const profile = await getStudentProfileByUserId(userId);
    expect(profile?.headline).toBe("New headline");
  });

  it("flips isProfileComplete = true once every required item is present", async () => {
    const userId = await makeStudent("flip-complete");
    await upsertProfileBasics(userId, FULL_BASICS);
    await setResumeStorageKey(userId, "resumes/fake.pdf");
    await addSkill(userId, { name: "TypeScript" });
    await addExperience(userId, {
      title: "Intern",
      organization: "Acme",
      startDate: new Date("2025-06-01"),
      endDate: null,
      description: null,
    });
    await addProject(userId, {
      name: "Side project",
      url: null,
      description: null,
    });
    const after = await getStudentProfileByUserId(userId);
    expect(after?.isProfileComplete).toBe(true);
  });

  it("keeps isProfileComplete = false when basics are partial", async () => {
    const userId = await makeStudent("partial");
    await upsertProfileBasics(userId, {
      ...FULL_BASICS,
      bio: null,
    });
    const after = await getStudentProfileByUserId(userId);
    expect(after?.isProfileComplete).toBe(false);
  });

  it("flips back to incomplete when a required field is cleared", async () => {
    const userId = await makeStudent("flip-incomplete");
    await upsertProfileBasics(userId, FULL_BASICS);
    await setResumeStorageKey(userId, "resumes/fake.pdf");
    await addSkill(userId, { name: "TS" });
    await addExperience(userId, {
      title: "Intern",
      organization: "Acme",
      startDate: null,
      endDate: null,
      description: null,
    });
    await addProject(userId, { name: "P", url: null, description: null });
    expect((await getStudentProfileByUserId(userId))?.isProfileComplete).toBe(
      true,
    );

    // Remove the resume — completeness should drop.
    await setResumeStorageKey(userId, null);
    expect((await getStudentProfileByUserId(userId))?.isProfileComplete).toBe(
      false,
    );
  });
});

describe.skipIf(skip)("student-service · ownership guards", () => {
  it("removeSkill rejects a skill owned by another student", async () => {
    const ownerId = await makeStudent("owner-skill");
    const attackerId = await makeStudent("attacker-skill");
    await upsertProfileBasics(ownerId, FULL_BASICS);
    await addSkill(ownerId, { name: "Owned" });

    const ownerProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: ownerId },
      include: { skills: true },
    });
    const skillId = ownerProfile.skills[0].id;

    await expect(removeSkill(attackerId, skillId)).rejects.toThrow();
    // Skill still exists.
    const stillThere = await prisma.studentSkill.findUnique({
      where: { id: skillId },
    });
    expect(stillThere).not.toBeNull();
  });

  it("removeExperience rejects an experience owned by another student", async () => {
    const ownerId = await makeStudent("owner-exp");
    const attackerId = await makeStudent("attacker-exp");
    await upsertProfileBasics(ownerId, FULL_BASICS);
    const created = await addExperience(ownerId, {
      title: "T",
      organization: "O",
      startDate: null,
      endDate: null,
      description: null,
    });

    await expect(removeExperience(attackerId, created.id)).rejects.toThrow();
    const stillThere = await prisma.studentExperience.findUnique({
      where: { id: created.id },
    });
    expect(stillThere).not.toBeNull();
  });

  it("removeProject rejects a project owned by another student", async () => {
    const ownerId = await makeStudent("owner-proj");
    const attackerId = await makeStudent("attacker-proj");
    await upsertProfileBasics(ownerId, FULL_BASICS);
    const created = await addProject(ownerId, {
      name: "P",
      url: null,
      description: null,
    });

    await expect(removeProject(attackerId, created.id)).rejects.toThrow();
    const stillThere = await prisma.studentProject.findUnique({
      where: { id: created.id },
    });
    expect(stillThere).not.toBeNull();
  });
});

describe.skipIf(skip)("student-service · canStudentReadResume", () => {
  it("returns true for the owner of a stored resume key", async () => {
    const userId = await makeStudent("resume-owner");
    await upsertProfileBasics(userId, FULL_BASICS);
    await setResumeStorageKey(userId, "resumes/owned.pdf");
    expect(await canStudentReadResume(userId, "resumes/owned.pdf")).toBe(true);
  });

  it("returns false for a different student", async () => {
    const ownerId = await makeStudent("resume-real-owner");
    const attackerId = await makeStudent("resume-attacker");
    await upsertProfileBasics(ownerId, FULL_BASICS);
    await setResumeStorageKey(ownerId, "resumes/owned.pdf");
    expect(await canStudentReadResume(attackerId, "resumes/owned.pdf")).toBe(
      false,
    );
  });

  it("returns false for an unrelated key the student doesn't own", async () => {
    const userId = await makeStudent("resume-other-key");
    await upsertProfileBasics(userId, FULL_BASICS);
    await setResumeStorageKey(userId, "resumes/mine.pdf");
    expect(await canStudentReadResume(userId, "resumes/notmine.pdf")).toBe(
      false,
    );
  });
});
