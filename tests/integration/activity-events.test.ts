// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import {
  listActivityPageForAdmin,
  setCompanyApprovalStatus,
  softDeleteCompanyAsAdmin,
  softDeleteJobPostingAsAdmin,
  softDeleteStudentAsAdmin,
} from "@/server/services/admin-service";
import {
  submitApplication,
  transitionApplicationStatus,
  withdrawApplicationByStudent,
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
import { startThreadAsCompany } from "@/server/services/message-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `act${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const STUDENT_FULL = {
  fullName: "",
  headline: "h",
  university: "U",
  graduationYear: 2027,
  degree: "B.S.",
  major: "CS",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "Bio",
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
  startDate: null as Date | null,
  duration: null as string | null,
  compensationType: null as null,
  compensationMin: null as number | null,
  compensationMax: null as number | null,
  description: "Body",
  responsibilities: null as string | null,
  qualifications: null as string | null,
  applicationDeadline: null as Date | null,
  programTag: null as string | null,
  status: "PUBLISHED" as const,
};

async function makeAdmin(suffix: string) {
  const u = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(u.id);
  return u.id;
}

async function makeStudent(suffix: string, complete = true) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, {
    ...STUDENT_FULL,
    fullName: `Stud ${suffix}`,
  });
  if (complete) {
    await setResumeStorageKey(r.userId, "resumes/test.pdf");
    await addSkill(r.userId, { name: "TypeScript" });
    await addExperience(r.userId, {
      title: "Intern",
      organization: "Acme",
      startDate: null,
      endDate: null,
      description: null,
    });
    await addProject(r.userId, {
      name: "Project",
      url: null,
      description: null,
    });
  }
  return r.userId;
}

async function makeCompany(suffix: string, adminId: string) {
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
  await setCompanyApprovalStatus(adminId, profile.companyProfileId, "APPROVED");
  return {
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
  };
}

async function findEvent(
  type: string,
  entityId: string,
): Promise<{ type: string; metadataJson: unknown } | null> {
  return prisma.activityEvent.findFirst({
    where: { type: type as never, entityId },
    select: { type: true, metadataJson: true },
    orderBy: { createdAt: "desc" },
  });
}

describe.skipIf(skip)("activity triggers · signup", () => {
  it("creates STUDENT_SIGNUP and COMPANY_SIGNUP events", async () => {
    const stud = await makeStudent("signup-s", false);
    const admin = await makeAdmin("signup-admin");
    const co = await makeCompany("signup-c", admin);

    expect(await findEvent("STUDENT_SIGNUP", stud)).not.toBeNull();
    expect(await findEvent("COMPANY_SIGNUP", co.companyUserId)).not.toBeNull();
  });
});

describe.skipIf(skip)("activity triggers · profile", () => {
  it("emits STUDENT_PROFILE_COMPLETED on the rising edge only", async () => {
    const stud = await makeStudent("profile-edge");
    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: stud },
      select: { id: true },
    });
    const events = await prisma.activityEvent.findMany({
      where: { type: "STUDENT_PROFILE_COMPLETED", entityId: profile.id },
    });
    expect(events.length).toBe(1);

    // Re-saving an already-complete profile must not re-fire.
    await upsertProfileBasics(stud, {
      ...STUDENT_FULL,
      fullName: `Stud profile-edge-renamed`,
    });
    const after = await prisma.activityEvent.findMany({
      where: { type: "STUDENT_PROFILE_COMPLETED", entityId: profile.id },
    });
    expect(after.length).toBe(1);
  });

  it("emits COMPANY_PROFILE_CREATED only on first save", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-co-pcreate@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) throw new Error("setup");
    createdUserIds.push(r.userId);
    await upsertCompanyProfile(r.userId, {
      ...COMPANY_BASE,
      companyName: `Co pcreate-${RUN_ID}`,
    });
    const created = await prisma.activityEvent.findMany({
      where: { type: "COMPANY_PROFILE_CREATED", actorUserId: r.userId },
    });
    expect(created.length).toBe(1);

    // Edit — no re-fire.
    await upsertCompanyProfile(r.userId, {
      ...COMPANY_BASE,
      companyName: `Co pcreate-${RUN_ID}`,
      industry: "Healthcare",
    });
    const after = await prisma.activityEvent.findMany({
      where: { type: "COMPANY_PROFILE_CREATED", actorUserId: r.userId },
    });
    expect(after.length).toBe(1);
  });
});

describe.skipIf(skip)("activity triggers · job postings lifecycle", () => {
  it("logs CREATED + PUBLISHED + PAUSED + CLOSED + ARCHIVED + SOFT_DELETED", async () => {
    const admin = await makeAdmin("life");
    const co = await makeCompany("life", admin);
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Lifecycle role",
    });
    if (!job.ok) throw new Error("setup");

    expect(await findEvent("JOB_POSTING_CREATED", job.id)).not.toBeNull();
    expect(await findEvent("JOB_POSTING_PUBLISHED", job.id)).not.toBeNull();

    await transitionJobPostingStatus(co.companyUserId, job.id, "PAUSED");
    expect(await findEvent("JOB_POSTING_PAUSED", job.id)).not.toBeNull();

    await transitionJobPostingStatus(co.companyUserId, job.id, "CLOSED");
    expect(await findEvent("JOB_POSTING_CLOSED", job.id)).not.toBeNull();

    await transitionJobPostingStatus(co.companyUserId, job.id, "ARCHIVED");
    expect(await findEvent("JOB_POSTING_ARCHIVED", job.id)).not.toBeNull();

    await softDeleteJobPosting(co.companyUserId, job.id);
    expect(await findEvent("JOB_POSTING_SOFT_DELETED", job.id)).not.toBeNull();
  });

  it("emits JOB_POSTING_PUBLISHED only on the rising edge from a draft", async () => {
    const admin = await makeAdmin("draft-pub");
    const co = await makeCompany("draft-pub", admin);
    const draft = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Draft role",
      status: "DRAFT" as unknown as "PUBLISHED",
    });
    if (!draft.ok) throw new Error("setup");

    const beforePub = await prisma.activityEvent.count({
      where: { type: "JOB_POSTING_PUBLISHED", entityId: draft.id },
    });
    expect(beforePub).toBe(0);
  });
});

describe.skipIf(skip)("activity triggers · applications", () => {
  it("logs APPLICATION_SUBMITTED, APPLICATION_STATUS_CHANGED, APPLICATION_WITHDRAWN", async () => {
    const admin = await makeAdmin("app-life");
    const co = await makeCompany("app-life", admin);
    const stud = await makeStudent("app-life");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "App lifecycle",
    });
    if (!job.ok) throw new Error("setup");

    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");

    expect(
      await prisma.activityEvent.findFirst({
        where: { type: "APPLICATION_SUBMITTED", actorUserId: stud },
      }),
    ).not.toBeNull();

    await transitionApplicationStatus(co.companyUserId, a.applicationId, "IN_REVIEW");
    expect(
      await findEvent("APPLICATION_STATUS_CHANGED", a.applicationId),
    ).not.toBeNull();

    // Walk to OFFER then have the student withdraw — distinct event type.
    await transitionApplicationStatus(co.companyUserId, a.applicationId, "INTERVIEWING");
    await transitionApplicationStatus(co.companyUserId, a.applicationId, "OFFER");

    // Use a separate fresh application for WITHDRAWN since the first
    // is now at OFFER (still active).
    const stud2 = await makeStudent("app-withdraw");
    const a2 = await submitApplication(stud2, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a2.ok) throw new Error("setup");
    await withdrawApplicationByStudent(stud2, a2.applicationId);
    const w = await findEvent("APPLICATION_WITHDRAWN", a2.applicationId);
    expect(w).not.toBeNull();
  });
});

describe.skipIf(skip)("activity triggers · messaging", () => {
  it("logs MESSAGE_THREAD_CREATED on company-initiated thread", async () => {
    const admin = await makeAdmin("msg");
    const co = await makeCompany("msg", admin);
    const stud = await makeStudent("msg");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Messaging role",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");

    const t = await startThreadAsCompany(co.companyUserId, a.applicationId, "Hi");
    if (!t.ok) throw new Error("setup");
    expect(await findEvent("MESSAGE_THREAD_CREATED", t.threadId)).not.toBeNull();
  });
});

describe.skipIf(skip)("activity triggers · admin soft-deletes", () => {
  it("logs COMPANY_SOFT_DELETED, STUDENT_SOFT_DELETED, JOB_POSTING_SOFT_DELETED", async () => {
    const admin = await makeAdmin("admin-sd");
    const co = await makeCompany("admin-sd", admin);
    const stud = await makeStudent("admin-sd");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Admin sd role",
    });
    if (!job.ok) throw new Error("setup");

    await softDeleteCompanyAsAdmin(admin, co.companyProfileId);
    expect(
      await findEvent("COMPANY_SOFT_DELETED", co.companyProfileId),
    ).not.toBeNull();

    await softDeleteStudentAsAdmin(admin, stud);
    expect(await findEvent("STUDENT_SOFT_DELETED", stud)).not.toBeNull();

    await softDeleteJobPostingAsAdmin(admin, job.id);
    expect(
      await findEvent("JOB_POSTING_SOFT_DELETED", job.id),
    ).not.toBeNull();
  });
});

describe.skipIf(skip)("admin activity listing · access control + filters", () => {
  it("rejects non-admin callers", async () => {
    const stud = await makeStudent("act-acl");
    const r = await listActivityPageForAdmin(stud, {}, { page: 1, pageSize: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_admin");
  });

  it("filters by eventType and is paginated at the DB level", async () => {
    const admin = await makeAdmin("act-filt");
    // Generate a few new APPLICATION_SUBMITTED events tagged to this run.
    const co = await makeCompany("act-filt", admin);
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Filter target",
    });
    if (!job.ok) throw new Error("setup");
    for (const i of [0, 1, 2]) {
      const s = await makeStudent(`act-filt-s${i}`);
      const a = await submitApplication(s, {
        jobPostingId: job.id,
        coverLetter: null,
      });
      if (!a.ok) throw new Error("setup");
    }

    const all = await listActivityPageForAdmin(
      admin,
      { eventType: "APPLICATION_SUBMITTED" },
      { page: 1, pageSize: 50 },
    );
    if (!all.ok) throw new Error("not admin");
    expect(all.data.rows.every((r) => r.type === "APPLICATION_SUBMITTED")).toBe(true);
    expect(all.data.total).toBeGreaterThanOrEqual(3);

    const page1 = await listActivityPageForAdmin(
      admin,
      { eventType: "APPLICATION_SUBMITTED" },
      { page: 1, pageSize: 2 },
    );
    if (!page1.ok) throw new Error("not admin");
    expect(page1.data.rows.length).toBe(2);

    const page2 = await listActivityPageForAdmin(
      admin,
      { eventType: "APPLICATION_SUBMITTED" },
      { page: 2, pageSize: 2 },
    );
    if (!page2.ok) throw new Error("not admin");
    const ids1 = new Set(page1.data.rows.map((r) => r.id));
    for (const r of page2.data.rows) expect(ids1.has(r.id)).toBe(false);
  });

  it("free-text q matches metadataJson contents (e.g. 'OFFER' on status change)", async () => {
    const admin = await makeAdmin("act-meta");
    const co = await makeCompany("act-meta", admin);
    const stud = await makeStudent("act-meta");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Meta search",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");
    await transitionApplicationStatus(co.companyUserId, a.applicationId, "IN_REVIEW");
    await transitionApplicationStatus(co.companyUserId, a.applicationId, "INTERVIEWING");
    await transitionApplicationStatus(co.companyUserId, a.applicationId, "OFFER");

    // Search for OFFER — must surface the APPLICATION_STATUS_CHANGED
    // row whose metadata recorded `{ from: 'INTERVIEWING', to: 'OFFER' }`.
    const r = await listActivityPageForAdmin(
      admin,
      { q: "OFFER", entityId: a.applicationId },
      { page: 1, pageSize: 50 },
    );
    if (!r.ok) throw new Error("not admin");
    expect(
      r.data.rows.some(
        (e) =>
          e.type === "APPLICATION_STATUS_CHANGED" &&
          JSON.stringify(e.metadataJson).includes("OFFER"),
      ),
    ).toBe(true);
  });

  it("programTag filter surfaces events about an affected entity even when actor has no tag", async () => {
    const admin = await makeAdmin("act-tag");
    const tag = `${RUN_ID}-cohortTag`;

    // Tagged student created, then admin (untagged) soft-deletes them.
    const stud = await makeStudent("act-tag-stud");
    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: stud },
      select: { id: true },
    });
    await prisma.studentProfile.update({
      where: { id: profile.id },
      data: { programTag: tag },
    });
    await softDeleteStudentAsAdmin(admin, stud);

    const r = await listActivityPageForAdmin(
      admin,
      { programTag: tag, eventType: "STUDENT_SOFT_DELETED" },
      { page: 1, pageSize: 50 },
    );
    if (!r.ok) throw new Error("not admin");
    expect(
      r.data.rows.some(
        (e) => e.type === "STUDENT_SOFT_DELETED" && e.entityId === stud,
      ),
    ).toBe(true);
  });

  it("filters by entityType + entityId", async () => {
    const admin = await makeAdmin("act-entity");
    const co = await makeCompany("act-entity", admin);
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Entity filter",
    });
    if (!job.ok) throw new Error("setup");

    const r = await listActivityPageForAdmin(
      admin,
      { entityType: "JobPosting", entityId: job.id },
      { page: 1, pageSize: 50 },
    );
    if (!r.ok) throw new Error("not admin");
    expect(r.data.rows.length).toBeGreaterThanOrEqual(2);
    expect(
      r.data.rows.every(
        (e) => e.entityType === "JobPosting" && e.entityId === job.id,
      ),
    ).toBe(true);
  });
});

describe.skipIf(skip)("hotfix · soft-delete visibility downstream", () => {
  it("listApplicationsForCompany hides apps from soft-deleted students", async () => {
    const { listApplicationsForCompany } = await import(
      "@/server/services/application-service"
    );
    const admin = await makeAdmin("hotfix-del-stud");
    const co = await makeCompany("hotfix-del-stud", admin);
    const stud = await makeStudent("hotfix-del-stud");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Hotfix",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");

    expect(
      (await listApplicationsForCompany(co.companyUserId)).some(
        (x) => x.id === a.applicationId,
      ),
    ).toBe(true);

    await softDeleteStudentAsAdmin(admin, stud);

    expect(
      (await listApplicationsForCompany(co.companyUserId)).some(
        (x) => x.id === a.applicationId,
      ),
    ).toBe(false);
  });

  it("listThreadsForCompany hides threads tied to soft-deleted students", async () => {
    const { listThreadsForCompany } = await import(
      "@/server/services/message-service"
    );
    const admin = await makeAdmin("hotfix-msg-stud");
    const co = await makeCompany("hotfix-msg-stud", admin);
    const stud = await makeStudent("hotfix-msg-stud");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Hotfix msg",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");
    const t = await startThreadAsCompany(
      co.companyUserId,
      a.applicationId,
      "Hi.",
    );
    if (!t.ok) throw new Error("setup");

    expect(
      (await listThreadsForCompany(co.companyUserId)).some(
        (x) => x.threadId === t.threadId,
      ),
    ).toBe(true);

    await softDeleteStudentAsAdmin(admin, stud);

    expect(
      (await listThreadsForCompany(co.companyUserId)).some(
        (x) => x.threadId === t.threadId,
      ),
    ).toBe(false);
  });

  it("listThreadsForStudent hides threads tied to soft-deleted companies", async () => {
    const { listThreadsForStudent } = await import(
      "@/server/services/message-service"
    );
    const admin = await makeAdmin("hotfix-msg-co");
    const co = await makeCompany("hotfix-msg-co", admin);
    const stud = await makeStudent("hotfix-msg-co");
    const job = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Hotfix co",
    });
    if (!job.ok) throw new Error("setup");
    const a = await submitApplication(stud, {
      jobPostingId: job.id,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");
    const t = await startThreadAsCompany(
      co.companyUserId,
      a.applicationId,
      "Hi.",
    );
    if (!t.ok) throw new Error("setup");

    expect(
      (await listThreadsForStudent(stud)).some((x) => x.threadId === t.threadId),
    ).toBe(true);

    await softDeleteCompanyAsAdmin(admin, co.companyProfileId);

    expect(
      (await listThreadsForStudent(stud)).some((x) => x.threadId === t.threadId),
    ).toBe(false);
  });
});
