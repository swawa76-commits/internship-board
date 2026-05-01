// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";
import {
  canCompanyReadApplicationSnapshot,
  listApplicationsForCompany,
  listApplicationsForStudent,
  submitApplication,
  transitionApplicationStatus,
} from "@/server/services/application-service";
import {
  createUserDirect,
  createUserWithCredentials,
} from "@/server/services/auth-service";
import { upsertCompanyProfile } from "@/server/services/company-service";
import {
  createJobPosting,
  softDeleteJobPosting,
  transitionJobPostingStatus,
} from "@/server/services/job-posting-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `app${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const STUDENT_FULL = {
  fullName: "Test Student",
  headline: "Aspiring backend engineer",
  university: "State University",
  graduationYear: 2027,
  degree: "B.S.",
  major: "Computer Science",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Profile body.",
  portfolioUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  programTag: null,
};

const COMPANY_BASE = {
  companyName: "",
  industry: "Software",
  companySize: "11-50",
  headquarters: "Remote",
  shortDescription: "Test co.",
  description: "Test co for applications.",
  contactEmail: "talent@test.local",
  websiteUrl: null,
  programTag: null,
};

const POSTING_BASE = {
  title: "",
  department: "Engineering",
  location: "Remote",
  workplaceType: "REMOTE" as const,
  internshipTerm: "SUMMER" as const,
  startDate: null,
  duration: null,
  compensationType: null,
  compensationMin: null,
  compensationMax: null,
  description: "Body",
  responsibilities: null,
  qualifications: null,
  applicationDeadline: null,
  programTag: null,
  status: "PUBLISHED" as const,
};

async function makeCompleteStudent(suffix: string, withResume = true) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, STUDENT_FULL);
  if (withResume) await setResumeStorageKey(r.userId, "resumes/test-key.pdf");
  await addSkill(r.userId, { name: "TypeScript" });
  await addExperience(r.userId, {
    title: "Intern",
    organization: "Acme",
    startDate: null,
    endDate: null,
    description: null,
  });
  await addProject(r.userId, { name: "Project", url: null, description: null });
  return r.userId;
}

async function makeIncompleteStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-incomp-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  // Save basics only — no skills/experiences/projects/resume, so
  // recomputeAndPersistCompleteness leaves isProfileComplete=false.
  await upsertProfileBasics(r.userId, STUDENT_FULL);
  return r.userId;
}

async function makeApprovedCoWithJob(
  suffix: string,
  jobOverrides: Partial<typeof POSTING_BASE> = {},
) {
  const adminUser = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(adminUser.id);
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-co-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  const profile = await upsertCompanyProfile(r.userId, {
    ...COMPANY_BASE,
    companyName: `Co ${suffix}`,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  await setCompanyApprovalStatus(adminUser.id, profile.companyProfileId, "APPROVED");
  const job = await createJobPosting(r.userId, {
    ...POSTING_BASE,
    title: `Job ${suffix}`,
    ...jobOverrides,
  });
  if (!job.ok) throw new Error("job setup failed");
  return {
    adminId: adminUser.id,
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
    jobId: job.id,
  };
}

describe.skipIf(skip)("submitApplication · pre-flight: profile completeness", () => {
  it("rejects with profile_incomplete when the student has no profile row", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-noprofile@test.local`,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    const co = await makeApprovedCoWithJob("noprofile-target");
    const result = await submitApplication(r.userId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("profile_incomplete");
  });

  it("rejects with profile_incomplete when the student profile is partial", async () => {
    const studentId = await makeIncompleteStudent("partial");
    const co = await makeApprovedCoWithJob("partial-target");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("profile_incomplete");
  });

  it("rejects with not_student when the actor is a COMPANY user", async () => {
    const co = await makeApprovedCoWithJob("co-as-applicant");
    const result = await submitApplication(co.companyUserId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_student");
  });
});

describe.skipIf(skip)("submitApplication · pre-flight: job state", () => {
  it("rejects with job_not_open when the posting is DRAFT", async () => {
    const studentId = await makeCompleteStudent("draft-applicant");
    const co = await makeApprovedCoWithJob("draft-target", {
      status: "DRAFT" as unknown as "PUBLISHED",
    });
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("job_not_open");
  });

  it("rejects with job_not_open when the posting was PUBLISHED then PAUSED", async () => {
    const studentId = await makeCompleteStudent("paused-applicant");
    const co = await makeApprovedCoWithJob("paused-target");
    await transitionJobPostingStatus(co.companyUserId, co.jobId, "PAUSED");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("job_not_open");
  });

  it("rejects with job_not_open when the posting was soft-deleted", async () => {
    const studentId = await makeCompleteStudent("soft-applicant");
    const co = await makeApprovedCoWithJob("soft-target");
    await softDeleteJobPosting(co.companyUserId, co.jobId);
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("job_not_open");
  });

  it("rejects with job_not_open when the company is SUSPENDED", async () => {
    const studentId = await makeCompleteStudent("susp-applicant");
    const co = await makeApprovedCoWithJob("susp-target");
    await setCompanyApprovalStatus(co.adminId, co.companyProfileId, "SUSPENDED");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("job_not_open");
  });
});

describe.skipIf(skip)("submitApplication · pre-flight: duplicate", () => {
  it("rejects a second application from the same student to the same posting", async () => {
    const studentId = await makeCompleteStudent("dup-applicant");
    const co = await makeApprovedCoWithJob("dup-target");

    const first = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(first.ok).toBe(true);

    const second = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: "Second time around.",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already_applied");
  });
});

describe.skipIf(skip)("submitApplication · success path + snapshot", () => {
  it("creates the application with snapshot of resume key and APPLIED status", async () => {
    const studentId = await makeCompleteStudent("happy");
    const co = await makeApprovedCoWithJob("happy-target");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: "Excited about this role!",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fresh = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
      select: {
        status: true,
        coverLetter: true,
        resumeStorageKeySnapshot: true,
      },
    });
    expect(fresh.status).toBe("APPLIED");
    expect(fresh.coverLetter).toBe("Excited about this role!");
    expect(fresh.resumeStorageKeySnapshot).toBe("resumes/test-key.pdf");
  });

  it("snapshot is immutable — replacing the student's resume after applying does not bleed", async () => {
    const studentId = await makeCompleteStudent("snap-immut");
    const co = await makeApprovedCoWithJob("snap-target");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!result.ok) throw new Error("setup failed");

    // Student replaces their resume.
    await setResumeStorageKey(studentId, "resumes/REPLACEMENT.pdf");

    // The snapshot on the existing application is unchanged.
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
      select: { resumeStorageKeySnapshot: true },
    });
    expect(application.resumeStorageKeySnapshot).toBe(
      "resumes/test-key.pdf",
    );
  });

  it("logs an APPLICATION_SUBMITTED activity event", async () => {
    const studentId = await makeCompleteStudent("event");
    const co = await makeApprovedCoWithJob("event-target");
    const result = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!result.ok) throw new Error("setup failed");

    const event = await prisma.activityEvent.findFirst({
      where: {
        type: "APPLICATION_SUBMITTED",
        actorUserId: studentId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(event).not.toBeNull();
  });

  it("supports a resume-less student (snapshot is null when student had no resume)", async () => {
    // The completeness guard normally requires a resume, so for this
    // case we hand-roll a profile that has every other required field
    // and flip isProfileComplete=true to bypass the guard. This is the
    // failure mode we want the snapshot field nullable for, even though
    // it shouldn't normally arise in production.
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-no-resume@test.local`,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);
    await upsertProfileBasics(r.userId, STUDENT_FULL);
    await addSkill(r.userId, { name: "TS" });
    await addExperience(r.userId, {
      title: "T",
      organization: "O",
      startDate: null,
      endDate: null,
      description: null,
    });
    await addProject(r.userId, { name: "P", url: null, description: null });
    // No resume; force isProfileComplete=true so we're isolating the
    // snapshot-null case from the completeness guard.
    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: r.userId },
    });
    await prisma.studentProfile.update({
      where: { id: profile.id },
      data: { isProfileComplete: true },
    });

    const co = await makeApprovedCoWithJob("no-resume-target");
    const result = await submitApplication(r.userId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
      select: { resumeStorageKeySnapshot: true },
    });
    expect(application.resumeStorageKeySnapshot).toBeNull();
  });
});

describe.skipIf(skip)("listApplicationsFor{Student,Company}", () => {
  it("a student sees only their own applications", async () => {
    const studentA = await makeCompleteStudent("listA");
    const studentB = await makeCompleteStudent("listB");
    const co = await makeApprovedCoWithJob("list-target");

    const a = await submitApplication(studentA, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const aList = await listApplicationsForStudent(studentA);
    const bList = await listApplicationsForStudent(studentB);
    expect(aList.some((x) => x.id === a.applicationId)).toBe(true);
    expect(bList.some((x) => x.id === a.applicationId)).toBe(false);
  });

  it("a company sees only applications to its own postings", async () => {
    const studentId = await makeCompleteStudent("comp-list");
    const coA = await makeApprovedCoWithJob("comp-list-A");
    const coB = await makeApprovedCoWithJob("comp-list-B");

    const aApp = await submitApplication(studentId, {
      jobPostingId: coA.jobId,
      coverLetter: null,
    });
    if (!aApp.ok) throw new Error("setup failed");

    const aList = await listApplicationsForCompany(coA.companyUserId);
    const bList = await listApplicationsForCompany(coB.companyUserId);
    expect(aList.some((x) => x.id === aApp.applicationId)).toBe(true);
    expect(bList.some((x) => x.id === aApp.applicationId)).toBe(false);
  });
});

describe.skipIf(skip)("transitionApplicationStatus", () => {
  it("forward transitions: APPLIED → IN_REVIEW → INTERVIEWING → OFFER", async () => {
    const studentId = await makeCompleteStudent("transit-fwd");
    const co = await makeApprovedCoWithJob("transit-fwd-target");
    const a = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r1 = await transitionApplicationStatus(
      co.companyUserId,
      a.applicationId,
      "IN_REVIEW",
    );
    expect(r1.ok).toBe(true);
    const r2 = await transitionApplicationStatus(
      co.companyUserId,
      a.applicationId,
      "INTERVIEWING",
    );
    expect(r2.ok).toBe(true);
    const r3 = await transitionApplicationStatus(
      co.companyUserId,
      a.applicationId,
      "OFFER",
    );
    expect(r3.ok).toBe(true);

    const fresh = await prisma.application.findUniqueOrThrow({
      where: { id: a.applicationId },
      select: { status: true },
    });
    expect(fresh.status).toBe("OFFER");
  });

  it("invalid transition (APPLIED → OFFER directly) is rejected", async () => {
    const studentId = await makeCompleteStudent("transit-bad");
    const co = await makeApprovedCoWithJob("transit-bad-target");
    const a = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await transitionApplicationStatus(
      co.companyUserId,
      a.applicationId,
      "OFFER",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_transition");
  });

  it("rejects when the calling company doesn't own the posting", async () => {
    const studentId = await makeCompleteStudent("transit-cross");
    const owner = await makeApprovedCoWithJob("transit-cross-owner");
    const attacker = await makeApprovedCoWithJob("transit-cross-attacker");
    const a = await submitApplication(studentId, {
      jobPostingId: owner.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await transitionApplicationStatus(
      attacker.companyUserId,
      a.applicationId,
      "IN_REVIEW",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");

    const fresh = await prisma.application.findUniqueOrThrow({
      where: { id: a.applicationId },
      select: { status: true },
    });
    expect(fresh.status).toBe("APPLIED");
  });
});

describe.skipIf(skip)("canCompanyReadApplicationSnapshot", () => {
  it("returns ok+key for the owning company", async () => {
    const studentId = await makeCompleteStudent("snap-perm");
    const co = await makeApprovedCoWithJob("snap-perm-target");
    const a = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await canCompanyReadApplicationSnapshot(
      co.companyUserId,
      a.applicationId,
    );
    expect(r.ok).toBe(true);
    expect(r.storageKey).toBe("resumes/test-key.pdf");
  });

  it("returns not-ok for a different company", async () => {
    const studentId = await makeCompleteStudent("snap-cross");
    const owner = await makeApprovedCoWithJob("snap-cross-owner");
    const attacker = await makeApprovedCoWithJob("snap-cross-attacker");
    const a = await submitApplication(studentId, {
      jobPostingId: owner.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await canCompanyReadApplicationSnapshot(
      attacker.companyUserId,
      a.applicationId,
    );
    expect(r.ok).toBe(false);
  });
});
