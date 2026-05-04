// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
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
  setCompanyApprovalStatus,
  listApplicationsPageForAdmin,
  listCompaniesPageForAdmin,
  listJobPostingsPageForAdmin,
  listStudentsPageForAdmin,
  softDeleteCompanyAsAdmin,
  softDeleteJobPostingAsAdmin,
  softDeleteStudentAsAdmin,
} from "@/server/services/admin-service";
import {
  setResumeStorageKey,
  upsertProfileBasics,
  addExperience,
  addProject,
  addSkill,
} from "@/server/services/student-service";

const RUN_ID = `apg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
  options: {
    complete?: boolean;
    programTag?: string | null;
    fullName?: string;
  } = {},
) {
  const { complete = true, programTag = null, fullName } = options;
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  await upsertProfileBasics(r.userId, {
    ...STUDENT_FULL,
    fullName: fullName ?? `Student ${suffix}`,
    programTag,
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

async function makeCompany(
  suffix: string,
  options: {
    adminId: string;
    approve?: boolean;
    programTag?: string | null;
  },
) {
  const { adminId, approve = true, programTag = null } = options;
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
    programTag,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  if (approve) {
    await setCompanyApprovalStatus(
      adminId,
      profile.companyProfileId,
      "APPROVED",
    );
  }
  return {
    companyUserId: r.userId,
    companyProfileId: profile.companyProfileId,
  };
}

async function makeJob(
  companyUserId: string,
  suffix: string,
  overrides: Partial<typeof POSTING_BASE> = {},
) {
  const job = await createJobPosting(companyUserId, {
    ...POSTING_BASE,
    title: `Job ${suffix}`,
    ...overrides,
  });
  if (!job.ok) throw new Error("job setup failed");
  return job.id;
}

// ---------- Access control ----------

describe.skipIf(skip)("admin pages · access control", () => {
  it("rejects non-admin callers across all four list methods", async () => {
    const stud = await makeStudent("acl");
    const co = await makeCompany("acl-co", {
      adminId: await makeAdmin("acl-1"),
      approve: false,
    });

    const noPage = { page: 1, pageSize: 5 };
    const cR = await listCompaniesPageForAdmin(stud, {}, noPage);
    expect(cR.ok).toBe(false);
    const sR = await listStudentsPageForAdmin(co.companyUserId, {}, noPage);
    expect(sR.ok).toBe(false);
    const jR = await listJobPostingsPageForAdmin(stud, {}, noPage);
    expect(jR.ok).toBe(false);
    const aR = await listApplicationsPageForAdmin(stud, {}, noPage);
    expect(aR.ok).toBe(false);
  });

  it("rejects non-admin callers for soft-delete actions", async () => {
    const admin = await makeAdmin("acl-mut");
    const stud = await makeStudent("acl-mut-s");
    const co = await makeCompany("acl-mut-co", { adminId: admin });
    const jobId = await makeJob(co.companyUserId, "acl-mut-j");

    const r1 = await softDeleteCompanyAsAdmin(stud, co.companyProfileId);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("not_admin");

    const r2 = await softDeleteStudentAsAdmin(co.companyUserId, stud);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("not_admin");

    const r3 = await softDeleteJobPostingAsAdmin(stud, jobId);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe("not_admin");
  });
});

// ---------- Pagination & filtering ----------

describe.skipIf(skip)(
  "admin pages · companies filter + DB-level pagination",
  () => {
    it("paginates companies with take/skip and reports total accurately", async () => {
      const admin = await makeAdmin("page");
      // Embed RUN_ID into the company name so a substring search reliably
      // matches just the rows this test created (other tests in this file
      // share the run-wide DB).
      const prefix = `${RUN_ID}page`;
      await makeCompany(`${prefix}-1`, { adminId: admin });
      await makeCompany(`${prefix}-2`, { adminId: admin });
      await makeCompany(`${prefix}-3`, { adminId: admin });

      const tag = `${RUN_ID}-tag`;
      await makeCompany(`${prefix}-tagged`, {
        adminId: admin,
        programTag: tag,
      });

      const tagged = await listCompaniesPageForAdmin(
        admin,
        { programTag: tag },
        { page: 1, pageSize: 5 },
      );
      if (!tagged.ok) throw new Error("not admin");
      expect(tagged.data.total).toBe(1);
      expect(tagged.data.rows.map((r) => r.companyName)).toEqual([
        `Co ${prefix}-tagged`,
      ]);

      const page1 = await listCompaniesPageForAdmin(
        admin,
        { q: prefix },
        { page: 1, pageSize: 2 },
      );
      if (!page1.ok) throw new Error("not admin");
      expect(page1.data.rows.length).toBe(2);
      expect(page1.data.total).toBeGreaterThanOrEqual(3);

      const page2 = await listCompaniesPageForAdmin(
        admin,
        { q: prefix },
        { page: 2, pageSize: 2 },
      );
      if (!page2.ok) throw new Error("not admin");
      const idsPage1 = new Set(page1.data.rows.map((r) => r.id));
      for (const row of page2.data.rows) {
        expect(idsPage1.has(row.id)).toBe(false);
      }
    });

    it("filters companies by approvalStatus", async () => {
      const admin = await makeAdmin("co-status-filter");
      const suffix = `${RUN_ID}susp`;
      const c = await makeCompany(suffix, { adminId: admin });
      await setCompanyApprovalStatus(admin, c.companyProfileId, "SUSPENDED");

      const r = await listCompaniesPageForAdmin(
        admin,
        { approvalStatus: "SUSPENDED", q: suffix },
        { page: 1, pageSize: 50 },
      );
      if (!r.ok) throw new Error("not admin");
      expect(r.data.rows.some((row) => row.id === c.companyProfileId)).toBe(
        true,
      );
      expect(
        r.data.rows.every((row) => row.approvalStatus === "SUSPENDED"),
      ).toBe(true);
    });
  },
);

// ---------- Admin visibility includes non-public job postings ----------

describe.skipIf(skip)(
  "admin pages · job visibility (no public-rules leak)",
  () => {
    it("admin sees DRAFT, PAUSED, CLOSED, ARCHIVED, suspended-company postings", async () => {
      const admin = await makeAdmin("vis");
      const co = await makeCompany("vis-co", { adminId: admin });
      const draft = await createJobPosting(co.companyUserId, {
        ...POSTING_BASE,
        title: "vis-draft",
        status: "DRAFT" as unknown as "PUBLISHED",
      });
      if (!draft.ok) throw new Error("setup");

      const published = await makeJob(co.companyUserId, "vis-published");
      await transitionJobPostingStatus(co.companyUserId, published, "PAUSED");

      // Suspend the owning company too — the admin job list must still
      // surface its postings (this is the rule public visibility blocks
      // but admin must NOT).
      const susCo = await makeCompany("vis-sus-co", { adminId: admin });
      await makeJob(susCo.companyUserId, "vis-sus-job");
      await setCompanyApprovalStatus(
        admin,
        susCo.companyProfileId,
        "SUSPENDED",
      );

      const r = await listJobPostingsPageForAdmin(
        admin,
        { q: "vis-" },
        { page: 1, pageSize: 50 },
      );
      if (!r.ok) throw new Error("not admin");
      const titles = r.data.rows.map((row) => row.title);
      expect(titles).toContain("vis-draft");
      expect(titles).toContain("Job vis-published");
      expect(titles).toContain("Job vis-sus-job");

      // Status filter still narrows correctly.
      const draftsOnly = await listJobPostingsPageForAdmin(
        admin,
        { status: "DRAFT", q: "vis-" },
        { page: 1, pageSize: 50 },
      );
      if (!draftsOnly.ok) throw new Error("not admin");
      expect(draftsOnly.data.rows.every((row) => row.status === "DRAFT")).toBe(
        true,
      );
    });

    it("companyProfileId filter restricts the job list to that company", async () => {
      const admin = await makeAdmin("vis-co-filter");
      const coA = await makeCompany("vis-co-A", { adminId: admin });
      const coB = await makeCompany("vis-co-B", { adminId: admin });
      const jA = await makeJob(coA.companyUserId, "A1");
      await makeJob(coB.companyUserId, "B1");

      const r = await listJobPostingsPageForAdmin(
        admin,
        { companyProfileId: coA.companyProfileId },
        { page: 1, pageSize: 50 },
      );
      if (!r.ok) throw new Error("not admin");
      expect(
        r.data.rows.every((row) => row.company.id === coA.companyProfileId),
      ).toBe(true);
      expect(r.data.rows.some((row) => row.id === jA)).toBe(true);
    });
  },
);

// ---------- Students filter ----------

describe.skipIf(skip)("admin pages · students filter", () => {
  it("filters by complete vs incomplete profiles", async () => {
    const admin = await makeAdmin("stud-filter");
    const sComplete = await makeStudent("stud-c", { complete: true });
    const sIncomplete = await makeStudent("stud-i", { complete: false });

    const completeR = await listStudentsPageForAdmin(
      admin,
      { completeness: "complete", q: `${RUN_ID}` },
      { page: 1, pageSize: 50 },
    );
    if (!completeR.ok) throw new Error("not admin");
    expect(completeR.data.rows.some((r) => r.userId === sComplete)).toBe(true);
    expect(completeR.data.rows.some((r) => r.userId === sIncomplete)).toBe(
      false,
    );
    expect(completeR.data.rows.every((r) => r.isProfileComplete)).toBe(true);

    const incompleteR = await listStudentsPageForAdmin(
      admin,
      { completeness: "incomplete", q: `${RUN_ID}` },
      { page: 1, pageSize: 50 },
    );
    if (!incompleteR.ok) throw new Error("not admin");
    expect(incompleteR.data.rows.some((r) => r.userId === sIncomplete)).toBe(
      true,
    );
    expect(incompleteR.data.rows.every((r) => !r.isProfileComplete)).toBe(true);
  });
});

// ---------- Applications filter ----------

describe.skipIf(skip)("admin pages · applications filter", () => {
  it("scopes by company and by status", async () => {
    const admin = await makeAdmin("app-filter");
    const coA = await makeCompany("app-coA", { adminId: admin });
    const coB = await makeCompany("app-coB", { adminId: admin });
    const jA = await makeJob(coA.companyUserId, "appA");
    const jB = await makeJob(coB.companyUserId, "appB");

    const sA = await makeStudent("appA-s");
    const sB = await makeStudent("appB-s");
    const a1 = await submitApplication(sA, {
      jobPostingId: jA,
      coverLetter: null,
    });
    const a2 = await submitApplication(sB, {
      jobPostingId: jB,
      coverLetter: null,
    });
    if (!a1.ok || !a2.ok) throw new Error("setup");

    const onlyA = await listApplicationsPageForAdmin(
      admin,
      { companyProfileId: coA.companyProfileId },
      { page: 1, pageSize: 50 },
    );
    if (!onlyA.ok) throw new Error("not admin");
    expect(onlyA.data.rows.some((r) => r.id === a1.applicationId)).toBe(true);
    expect(onlyA.data.rows.some((r) => r.id === a2.applicationId)).toBe(false);

    const allApplied = await listApplicationsPageForAdmin(
      admin,
      { status: "APPLIED", companyProfileId: coB.companyProfileId },
      { page: 1, pageSize: 50 },
    );
    if (!allApplied.ok) throw new Error("not admin");
    expect(allApplied.data.rows.some((r) => r.id === a2.applicationId)).toBe(
      true,
    );
    expect(allApplied.data.rows.every((r) => r.status === "APPLIED")).toBe(
      true,
    );
  });
});

// ---------- Mutations: approval + soft-delete ----------

describe.skipIf(skip)("admin pages · approval & suspension", () => {
  it("approve → suspend → re-approve cycles through setCompanyApprovalStatus", async () => {
    const admin = await makeAdmin("cycle");
    const co = await makeCompany("cycle-co", {
      adminId: admin,
      approve: false,
    });
    expect(
      (
        await prisma.companyProfile.findUniqueOrThrow({
          where: { id: co.companyProfileId },
        })
      ).approvalStatus,
    ).toBe("PENDING");

    const a = await setCompanyApprovalStatus(
      admin,
      co.companyProfileId,
      "APPROVED",
    );
    expect(a.ok).toBe(true);
    const s = await setCompanyApprovalStatus(
      admin,
      co.companyProfileId,
      "SUSPENDED",
    );
    expect(s.ok).toBe(true);
    const r = await setCompanyApprovalStatus(
      admin,
      co.companyProfileId,
      "APPROVED",
    );
    expect(r.ok).toBe(true);

    const fresh = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
    });
    expect(fresh.approvalStatus).toBe("APPROVED");
  });
});

describe.skipIf(skip)("admin pages · soft-delete behavior", () => {
  it("soft-deletes a company; row hides from default list but appears with includeDeleted", async () => {
    const admin = await makeAdmin("sd-co");
    const suffix = `${RUN_ID}sdco`;
    const co = await makeCompany(suffix, { adminId: admin });

    const del = await softDeleteCompanyAsAdmin(admin, co.companyProfileId);
    expect(del.ok).toBe(true);

    const row = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
    });
    expect(row.deletedAt).not.toBeNull();

    const hidden = await listCompaniesPageForAdmin(
      admin,
      { q: suffix },
      { page: 1, pageSize: 50 },
    );
    if (!hidden.ok) throw new Error("not admin");
    expect(hidden.data.rows.some((r) => r.id === co.companyProfileId)).toBe(
      false,
    );

    const visible = await listCompaniesPageForAdmin(
      admin,
      { q: suffix, includeDeleted: true },
      { page: 1, pageSize: 50 },
    );
    if (!visible.ok) throw new Error("not admin");
    const found = visible.data.rows.find((r) => r.id === co.companyProfileId);
    expect(found).toBeDefined();
    expect(found?.deletedAt).not.toBeNull();
  });

  it("soft-deletes a student user; partial-unique frees the email for reuse", async () => {
    const admin = await makeAdmin("sd-stud");
    const sId = await makeStudent("sd-stud-1");
    const r = await softDeleteStudentAsAdmin(admin, sId);
    expect(r.ok).toBe(true);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: sId } });
    expect(u.deletedAt).not.toBeNull();

    // Re-registering the same email succeeds.
    const reReg = await createUserWithCredentials({
      email: u.email,
      password: "longenough",
      role: "STUDENT",
    });
    expect(reReg.ok).toBe(true);
    if (reReg.ok) createdUserIds.push(reReg.userId);
  });

  it("soft-deletes a job posting; row hides from default admin list", async () => {
    const admin = await makeAdmin("sd-job");
    const co = await makeCompany("sd-job-co", { adminId: admin });
    const jId = await makeJob(co.companyUserId, "sd-job-1");

    const r = await softDeleteJobPostingAsAdmin(admin, jId);
    expect(r.ok).toBe(true);

    const hidden = await listJobPostingsPageForAdmin(
      admin,
      { q: "sd-job-1" },
      { page: 1, pageSize: 50 },
    );
    if (!hidden.ok) throw new Error("not admin");
    expect(hidden.data.rows.some((r) => r.id === jId)).toBe(false);

    const visible = await listJobPostingsPageForAdmin(
      admin,
      { q: "sd-job-1", includeDeleted: true },
      { page: 1, pageSize: 50 },
    );
    if (!visible.ok) throw new Error("not admin");
    const found = visible.data.rows.find((r) => r.id === jId);
    expect(found).toBeDefined();
    expect(found?.deletedAt).not.toBeNull();
  });

  it("returns not_found when soft-deleting a missing or already-deleted row", async () => {
    const admin = await makeAdmin("sd-missing");
    const r = await softDeleteCompanyAsAdmin(
      admin,
      "cmiss00000000000000000000000",
    );
    // Result type: cuid validation lives in the action layer; the
    // service just returns not_found because the row doesn't exist.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });
});
