// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import {
  getAdminDashboard,
  listProgramTags,
} from "@/server/services/admin-metrics-service";
import { setCompanyApprovalStatus } from "@/server/services/admin-service";
import { submitApplication } from "@/server/services/application-service";
import {
  createUserDirect,
  createUserWithCredentials,
} from "@/server/services/auth-service";
import { upsertCompanyProfile } from "@/server/services/company-service";
import {
  createJobPosting,
  transitionJobPostingStatus,
} from "@/server/services/job-posting-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `mtr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const STUDENT_FULL = {
  fullName: "Metrics Tester",
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

async function makeStudent(
  suffix: string,
  options: { complete?: boolean; programTag?: string | null } = {},
) {
  const { complete = true, programTag = null } = options;
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, { ...STUDENT_FULL, programTag });
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

async function makeApprovedCoWithJob(
  suffix: string,
  options: {
    adminId: string;
    programTag?: string | null;
    jobOverrides?: Partial<typeof POSTING_BASE>;
  },
) {
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
    programTag: options.programTag ?? null,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  await setCompanyApprovalStatus(
    options.adminId,
    profile.companyProfileId,
    "APPROVED",
  );
  const job = await createJobPosting(r.userId, {
    ...POSTING_BASE,
    title: `Job ${suffix}`,
    programTag: options.programTag ?? null,
    ...(options.jobOverrides ?? {}),
  });
  if (!job.ok) throw new Error("job setup failed");
  return {
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
    jobId: job.id,
  };
}

describe.skipIf(skip)("admin-metrics · access control", () => {
  it("rejects a non-admin caller with reason 'not_admin'", async () => {
    const stud = await makeStudent("non-admin", { complete: false });
    const r = await getAdminDashboard(stud);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_admin");

    const tags = await listProgramTags(stud);
    expect(tags.ok).toBe(false);
  });

  it("returns ok=true for an active ADMIN user", async () => {
    const admin = await makeAdmin("ok");
    const r = await getAdminDashboard(admin);
    expect(r.ok).toBe(true);
  });

  it("rejects a soft-deleted admin", async () => {
    const admin = await makeAdmin("soft-deleted");
    await prisma.user.update({
      where: { id: admin },
      data: { deletedAt: new Date() },
    });
    const r = await getAdminDashboard(admin);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_admin");
  });
});

describe.skipIf(skip)("admin-metrics · overview aggregations", () => {
  it("counts students complete vs incomplete using isProfileComplete", async () => {
    const admin = await makeAdmin("overview-students");
    const completeBefore = await prisma.studentProfile.count({
      where: { isProfileComplete: true },
    });
    const incompleteBefore = await prisma.studentProfile.count({
      where: { isProfileComplete: false },
    });

    await makeStudent("overview-c1", { complete: true });
    await makeStudent("overview-c2", { complete: true });
    await makeStudent("overview-i1", { complete: false });

    const r = await getAdminDashboard(admin);
    if (!r.ok) throw new Error("not admin");
    expect(r.data.overview.studentsCompleteProfiles).toBeGreaterThanOrEqual(
      completeBefore + 2,
    );
    expect(r.data.overview.studentsIncompleteProfiles).toBeGreaterThanOrEqual(
      incompleteBefore + 1,
    );
    expect(r.data.overview.totalStudents).toBe(
      r.data.overview.studentsCompleteProfiles +
        r.data.overview.studentsIncompleteProfiles,
    );
  });

  it("counts companies grouped by approvalStatus", async () => {
    const admin = await makeAdmin("overview-cos");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    await makeApprovedCoWithJob("overview-co1", { adminId: admin });
    await makeApprovedCoWithJob("overview-co2", { adminId: admin });

    // Spawn a third company and leave it PENDING.
    const u = await createUserWithCredentials({
      email: `${RUN_ID}-co-pending@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!u.ok) throw new Error("setup");
    createdUserIds.push(u.userId);
    await upsertCompanyProfile(u.userId, {
      ...COMPANY_BASE,
      companyName: "Pending Co",
    });

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");
    expect(after.data.overview.approvedCompanies).toBe(
      before.data.overview.approvedCompanies + 2,
    );
    expect(after.data.overview.pendingCompanies).toBe(
      before.data.overview.pendingCompanies + 1,
    );
    expect(after.data.overview.totalCompanies).toBe(
      after.data.overview.approvedCompanies +
        after.data.overview.pendingCompanies +
        after.data.overview.suspendedCompanies,
    );
  });

  it("counts job postings grouped by status; openJobPostings = PUBLISHED + APPROVED", async () => {
    const admin = await makeAdmin("overview-jobs");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const co = await makeApprovedCoWithJob("overview-jobs-co", {
      adminId: admin,
    });
    // Add a draft posting.
    const draft = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "Draft posting",
      status: "DRAFT" as unknown as "PUBLISHED",
    });
    if (!draft.ok) throw new Error("setup");

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");

    expect(after.data.overview.publishedJobPostings).toBe(
      before.data.overview.publishedJobPostings + 1,
    );
    expect(after.data.overview.jobPostingsByStatus.DRAFT).toBe(
      before.data.overview.jobPostingsByStatus.DRAFT + 1,
    );
    expect(after.data.overview.openJobPostings).toBe(
      before.data.overview.openJobPostings + 1,
    );

    // Suspending the owning company drops the open count but not
    // publishedJobPostings (status alone, not the join).
    await setCompanyApprovalStatus(admin, co.companyProfileId, "SUSPENDED");
    const suspended = await getAdminDashboard(admin);
    if (!suspended.ok) throw new Error("not admin");
    expect(suspended.data.overview.openJobPostings).toBe(
      before.data.overview.openJobPostings,
    );
    expect(suspended.data.overview.publishedJobPostings).toBe(
      before.data.overview.publishedJobPostings + 1,
    );
  });

  it("aggregates applications by status and reflects them in the funnel snapshot", async () => {
    const admin = await makeAdmin("funnel");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const co = await makeApprovedCoWithJob("funnel-co", { adminId: admin });
    const stud = await makeStudent("funnel-s");
    const appR = await submitApplication(stud, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!appR.ok) throw new Error("setup");

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");

    expect(after.data.overview.totalApplications).toBe(
      before.data.overview.totalApplications + 1,
    );
    expect(after.data.overview.applicationsByStatus.APPLIED).toBe(
      before.data.overview.applicationsByStatus.APPLIED + 1,
    );
    expect(after.data.funnel.totalApplications).toBe(
      after.data.overview.totalApplications,
    );
    expect(
      after.data.funnel.jobPostingsWithAtLeastOneApplicant,
    ).toBeGreaterThanOrEqual(
      before.data.funnel.jobPostingsWithAtLeastOneApplicant + 1,
    );
  });
});

describe.skipIf(skip)("admin-metrics · operational alerts", () => {
  it("counts published postings whose deadline falls in the next 7 days", async () => {
    const admin = await makeAdmin("alert-deadline");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await makeApprovedCoWithJob("alert-deadline-co", {
      adminId: admin,
      jobOverrides: { applicationDeadline: deadline },
    });

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");
    expect(after.data.alerts.jobPostingsClosingIn7Days).toBe(
      before.data.alerts.jobPostingsClosingIn7Days + 1,
    );
  });

  it("flags published postings older than 14 days with zero applicants", async () => {
    const admin = await makeAdmin("alert-zero");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const co = await makeApprovedCoWithJob("alert-zero-co", { adminId: admin });
    // Backdate publishedAt to 30 days ago.
    await prisma.jobPosting.update({
      where: { id: co.jobId },
      data: { publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");
    expect(after.data.alerts.jobPostingsZeroApplicantsAfter14Days).toBe(
      before.data.alerts.jobPostingsZeroApplicantsAfter14Days + 1,
    );
  });

  it("counts draft postings", async () => {
    const admin = await makeAdmin("alert-drafts");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const co = await makeApprovedCoWithJob("alert-drafts-co", {
      adminId: admin,
    });
    await transitionJobPostingStatus(co.companyUserId, co.jobId, "PAUSED");
    // Add a separate draft from the same company.
    const draft = await createJobPosting(co.companyUserId, {
      ...POSTING_BASE,
      title: "alert-drafts draft",
      status: "DRAFT" as unknown as "PUBLISHED",
    });
    if (!draft.ok) throw new Error("setup");

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");
    expect(after.data.alerts.draftJobPostings).toBe(
      before.data.alerts.draftJobPostings + 1,
    );
  });
});

describe.skipIf(skip)("admin-metrics · time filter", () => {
  it("applicationsLast7Days excludes applications backdated 30 days", async () => {
    const admin = await makeAdmin("window");
    const before = await getAdminDashboard(admin);
    if (!before.ok) throw new Error("not admin");

    const co = await makeApprovedCoWithJob("window-co", { adminId: admin });
    const stud = await makeStudent("window-s");
    const a = await submitApplication(stud, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!a.ok) throw new Error("setup");
    // Backdate clearly inside the 30d window (so it counts) but
    // outside 7d. Using exactly 30d collides with the cutoff after
    // a few extra ms of test wall-clock time.
    await prisma.application.update({
      where: { id: a.applicationId },
      data: { appliedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });

    const after = await getAdminDashboard(admin);
    if (!after.ok) throw new Error("not admin");
    expect(after.data.overview.applicationsLast7Days).toBe(
      before.data.overview.applicationsLast7Days,
    );
    expect(after.data.overview.applicationsLast30Days).toBeGreaterThanOrEqual(
      before.data.overview.applicationsLast30Days + 1,
    );

    const w90 = await getAdminDashboard(admin, { applicationsWindow: "90d" });
    if (!w90.ok) throw new Error("not admin");
    expect(
      w90.data.overview.applicationsInSelectedWindow,
    ).toBeGreaterThanOrEqual(after.data.overview.applicationsLast30Days);
  });
});

describe.skipIf(skip)("admin-metrics · program tag filter", () => {
  it("scopes overview counts to a single program tag", async () => {
    const admin = await makeAdmin("tag");
    const tag = `${RUN_ID}-cohort-A`;

    const co = await makeApprovedCoWithJob("tag-co", {
      adminId: admin,
      programTag: tag,
    });
    const stud = await makeStudent("tag-s", { programTag: tag });
    const appR = await submitApplication(stud, {
      jobPostingId: co.jobId,
      coverLetter: null,
    });
    if (!appR.ok) throw new Error("setup");

    // Untagged baseline activity.
    const otherCo = await makeApprovedCoWithJob("tag-other-co", {
      adminId: admin,
    });
    const otherStud = await makeStudent("tag-other-s");
    await submitApplication(otherStud, {
      jobPostingId: otherCo.jobId,
      coverLetter: null,
    });

    const tagged = await getAdminDashboard(admin, { programTag: tag });
    if (!tagged.ok) throw new Error("not admin");

    // Every tagged company in this run is exactly one (the one we made).
    expect(tagged.data.overview.totalCompanies).toBe(1);
    expect(tagged.data.overview.approvedCompanies).toBe(1);
    expect(tagged.data.overview.totalApplications).toBe(1);
    expect(tagged.data.overview.totalJobPostings).toBe(1);

    const all = await getAdminDashboard(admin);
    if (!all.ok) throw new Error("not admin");
    expect(all.data.overview.totalCompanies).toBeGreaterThan(
      tagged.data.overview.totalCompanies,
    );
  });

  it("listProgramTags returns the distinct tags currently in use", async () => {
    const admin = await makeAdmin("tag-list");
    const tag = `${RUN_ID}-cohort-B`;
    await makeApprovedCoWithJob("tag-list-co", {
      adminId: admin,
      programTag: tag,
    });

    const r = await listProgramTags(admin);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toContain(tag);
  });
});

describe.skipIf(skip)(
  "admin-metrics · top postings + company participation",
  () => {
    it("ranks postings by application count descending", async () => {
      const admin = await makeAdmin("top-rank");
      const co = await makeApprovedCoWithJob("top-rank-co", { adminId: admin });
      // Two applicants for this posting.
      for (const i of [0, 1]) {
        const s = await makeStudent(`top-${i}`);
        const a = await submitApplication(s, {
          jobPostingId: co.jobId,
          coverLetter: null,
        });
        if (!a.ok) throw new Error("setup");
      }

      const r = await getAdminDashboard(admin);
      if (!r.ok) throw new Error("not admin");
      const ranked = r.data.topJobPostings.find((p) => p.id === co.jobId);
      expect(ranked).toBeDefined();
      expect(ranked?.applicationCount).toBeGreaterThanOrEqual(2);
      // Sorted descending overall.
      for (let i = 1; i < r.data.topJobPostings.length; i++) {
        expect(
          r.data.topJobPostings[i - 1].applicationCount,
        ).toBeGreaterThanOrEqual(r.data.topJobPostings[i].applicationCount);
      }
    });

    it("companyParticipation rolls up open postings + total applicants per company", async () => {
      const admin = await makeAdmin("part");
      const co = await makeApprovedCoWithJob("part-co", { adminId: admin });
      const s1 = await makeStudent("part-s1");
      const s2 = await makeStudent("part-s2");
      const a1 = await submitApplication(s1, {
        jobPostingId: co.jobId,
        coverLetter: null,
      });
      const a2 = await submitApplication(s2, {
        jobPostingId: co.jobId,
        coverLetter: null,
      });
      if (!a1.ok || !a2.ok) throw new Error("setup");

      const r = await getAdminDashboard(admin);
      if (!r.ok) throw new Error("not admin");
      const row = r.data.companyParticipation.find(
        (c) => c.id === co.companyProfileId,
      );
      expect(row).toBeDefined();
      expect(row?.openJobPostings).toBe(1);
      expect(row?.totalApplicants).toBeGreaterThanOrEqual(2);
      expect(row?.approvalStatus).toBe("APPROVED");
    });
  },
);
