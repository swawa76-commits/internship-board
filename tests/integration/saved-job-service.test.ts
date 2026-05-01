// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";
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
  countSavedJobsForStudent,
  isJobSavedByStudent,
  listSavedJobsForStudent,
  saveJobPosting,
  unsaveJobPosting,
} from "@/server/services/saved-job-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `sav${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const STUDENT_FULL = {
  fullName: "Save Tester",
  headline: "Aspiring engineer",
  university: "State U",
  graduationYear: 2027,
  degree: "B.S.",
  major: "CS",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Body",
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
  shortDescription: "Co",
  description: "Co body.",
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

async function makeStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, STUDENT_FULL);
  await setResumeStorageKey(r.userId, "resumes/test.pdf");
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

describe.skipIf(skip)("saveJobPosting · happy path", () => {
  it("saves a publicly visible posting and is idempotent", async () => {
    const studentId = await makeStudent("save-happy");
    const co = await makeApprovedCoWithJob("save-happy-target");

    const first = await saveJobPosting(studentId, co.jobId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadySaved).toBe(false);
    expect(await isJobSavedByStudent(studentId, co.jobId)).toBe(true);

    const second = await saveJobPosting(studentId, co.jobId);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySaved).toBe(true);

    expect(await countSavedJobsForStudent(studentId)).toBe(1);
  });
});

describe.skipIf(skip)("saveJobPosting · visibility guard", () => {
  it("rejects with job_not_savable when the posting is DRAFT", async () => {
    const studentId = await makeStudent("save-draft");
    const co = await makeApprovedCoWithJob("save-draft-target", {
      status: "DRAFT" as unknown as "PUBLISHED",
    });
    const r = await saveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("job_not_savable");
    expect(await isJobSavedByStudent(studentId, co.jobId)).toBe(false);
  });

  it("rejects when the posting was PAUSED after publish", async () => {
    const studentId = await makeStudent("save-paused");
    const co = await makeApprovedCoWithJob("save-paused-target");
    await transitionJobPostingStatus(co.companyUserId, co.jobId, "PAUSED");
    const r = await saveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("job_not_savable");
  });

  it("rejects when the posting was soft-deleted", async () => {
    const studentId = await makeStudent("save-soft");
    const co = await makeApprovedCoWithJob("save-soft-target");
    await softDeleteJobPosting(co.companyUserId, co.jobId);
    const r = await saveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("job_not_savable");
  });

  it("rejects when the owning company is SUSPENDED", async () => {
    const studentId = await makeStudent("save-susp");
    const co = await makeApprovedCoWithJob("save-susp-target");
    await setCompanyApprovalStatus(
      co.adminId,
      co.companyProfileId,
      "SUSPENDED",
    );
    const r = await saveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("job_not_savable");
  });

  it("rejects with not_student when the actor isn't a student", async () => {
    const co = await makeApprovedCoWithJob("save-not-student");
    const r = await saveJobPosting(co.companyUserId, co.jobId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_student");
  });
});

describe.skipIf(skip)("unsaveJobPosting", () => {
  it("removes an existing saved row and reports removed=true", async () => {
    const studentId = await makeStudent("unsave-exists");
    const co = await makeApprovedCoWithJob("unsave-exists-target");
    await saveJobPosting(studentId, co.jobId);

    const r = await unsaveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toBe(true);
    expect(await isJobSavedByStudent(studentId, co.jobId)).toBe(false);
  });

  it("is a no-op when the student never saved the posting", async () => {
    const studentId = await makeStudent("unsave-noop");
    const co = await makeApprovedCoWithJob("unsave-noop-target");
    const r = await unsaveJobPosting(studentId, co.jobId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toBe(false);
  });
});

describe.skipIf(skip)("listSavedJobsForStudent · staleness flag", () => {
  it("flags isCurrentlyOpen=false once the saved posting goes private", async () => {
    const studentId = await makeStudent("list-stale");
    const co = await makeApprovedCoWithJob("list-stale-target");
    const save = await saveJobPosting(studentId, co.jobId);
    expect(save.ok).toBe(true);

    let saved = await listSavedJobsForStudent(studentId);
    expect(saved.find((s) => s.jobPosting.id === co.jobId)?.jobPosting.isCurrentlyOpen).toBe(true);

    await transitionJobPostingStatus(co.companyUserId, co.jobId, "PAUSED");
    saved = await listSavedJobsForStudent(studentId);
    const row = saved.find((s) => s.jobPosting.id === co.jobId);
    // Saved row preserved — staleness surfaced via the flag, not by
    // dropping it from the list.
    expect(row).toBeDefined();
    expect(row?.jobPosting.isCurrentlyOpen).toBe(false);
  });

  it("scopes results to the calling student", async () => {
    const studentA = await makeStudent("list-scope-A");
    const studentB = await makeStudent("list-scope-B");
    const co = await makeApprovedCoWithJob("list-scope-target");
    await saveJobPosting(studentA, co.jobId);

    const aList = await listSavedJobsForStudent(studentA);
    const bList = await listSavedJobsForStudent(studentB);
    expect(aList.some((s) => s.jobPosting.id === co.jobId)).toBe(true);
    expect(bList.some((s) => s.jobPosting.id === co.jobId)).toBe(false);
  });
});

describe.skipIf(skip)("withdrawApplicationByStudent", () => {
  it("transitions an APPLIED application to WITHDRAWN and blocks reapply", async () => {
    // Cross-feature integration: WITHDRAWN closes the funnel and the
    // unique (jobPostingId, studentProfileId) constraint blocks a
    // second application from the same student to the same posting.
    const { submitApplication } = await import(
      "@/server/services/application-service"
    );
    const { withdrawApplicationByStudent } = await import(
      "@/server/services/application-service"
    );

    const studentId = await makeStudent("withdraw-applied");
    const co = await makeApprovedCoWithJob("withdraw-applied-target");
    const a = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await withdrawApplicationByStudent(studentId, a.applicationId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from).toBe("APPLIED");

    const fresh = await prisma.application.findUniqueOrThrow({
      where: { id: a.applicationId },
      select: { status: true },
    });
    expect(fresh.status).toBe("WITHDRAWN");

    // Reapply blocked — Clarification 4: one application ever per
    // student per posting.
    const second = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already_applied");
  });

  it("rejects withdrawal of a REJECTED application (terminal state)", async () => {
    const { submitApplication, transitionApplicationStatus, withdrawApplicationByStudent } =
      await import("@/server/services/application-service");
    const studentId = await makeStudent("withdraw-rejected");
    const co = await makeApprovedCoWithJob("withdraw-rejected-target");
    const a = await submitApplication(studentId, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");
    await transitionApplicationStatus(
      co.companyUserId,
      a.applicationId,
      "REJECTED",
    );

    const r = await withdrawApplicationByStudent(studentId, a.applicationId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_active");
  });

  it("rejects when another student tries to withdraw someone else's application", async () => {
    const { submitApplication, withdrawApplicationByStudent } = await import(
      "@/server/services/application-service"
    );
    const owner = await makeStudent("withdraw-cross-owner");
    const attacker = await makeStudent("withdraw-cross-attacker");
    const co = await makeApprovedCoWithJob("withdraw-cross-target");
    const a = await submitApplication(owner, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup failed");

    const r = await withdrawApplicationByStudent(attacker, a.applicationId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });
});
