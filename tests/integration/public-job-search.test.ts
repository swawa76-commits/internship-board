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
  updateJobPosting,
} from "@/server/services/job-posting-service";
import {
  countPublicJobPostings,
  getPublicCompanyBySlug,
  getPublicJobPostingBySlugs,
  searchPublicJobPostings,
} from "@/server/services/public-job-search";

const RUN_ID = `pjs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const COMPANY_BASE = {
  companyName: "",
  industry: "Software",
  companySize: "11-50",
  headquarters: "Remote",
  shortDescription: "Test co for public job search.",
  description: "An imaginary company for the public-search suite.",
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
  startDate: new Date("2026-06-01"),
  duration: "12 weeks",
  compensationType: "PAID" as const,
  compensationMin: 30,
  compensationMax: 45,
  description: "",
  responsibilities: null,
  qualifications: null,
  applicationDeadline: null,
  programTag: null,
  status: "PUBLISHED" as const,
};

async function makeApprovedCo(
  suffix: string,
  overrides: Partial<typeof COMPANY_BASE> = {},
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
    ...overrides,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  await setCompanyApprovalStatus(
    adminUser.id,
    profile.companyProfileId,
    "APPROVED",
  );
  const co = await prisma.companyProfile.findUniqueOrThrow({
    where: { id: profile.companyProfileId },
    select: { id: true, slug: true },
  });
  return {
    userId: r.userId,
    adminId: adminUser.id,
    companyProfileId: co.id,
    companySlug: co.slug,
  };
}

async function makePendingCo(suffix: string) {
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
  const co = await prisma.companyProfile.findUniqueOrThrow({
    where: { id: profile.companyProfileId },
    select: { id: true, slug: true },
  });
  return {
    userId: r.userId,
    companyProfileId: co.id,
    companySlug: co.slug,
  };
}

describe.skipIf(skip)("searchPublicJobPostings · visibility leakage guards", () => {
  it("excludes a posting whose owning company is PENDING", async () => {
    const co = await makePendingCo("pending-vis");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Pending visibility ${RUN_ID}`,
      description: "Should never appear publicly.",
      status: "DRAFT", // PENDING co can't publish — we'll DRAFT and inspect
    });
    if (!created.ok) throw new Error("setup failed");

    const visible = await searchPublicJobPostings({
      keyword: "Pending visibility",
    });
    expect(visible.some((r) => r.id === created.id)).toBe(false);
  });

  it("excludes a posting whose owning company is SUSPENDED", async () => {
    const co = await makeApprovedCo("suspend-vis");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Suspended visibility ${RUN_ID}`,
      description: "Body for suspended-co posting.",
    });
    if (!created.ok) throw new Error("setup failed");

    // Visible while APPROVED.
    let visible = await searchPublicJobPostings({
      keyword: "Suspended visibility",
    });
    expect(visible.some((r) => r.id === created.id)).toBe(true);

    // Suspend — the same posting must drop out.
    await setCompanyApprovalStatus(co.adminId, co.companyProfileId, "SUSPENDED");
    visible = await searchPublicJobPostings({
      keyword: "Suspended visibility",
    });
    expect(visible.some((r) => r.id === created.id)).toBe(false);
  });

  it("excludes DRAFT, PAUSED, CLOSED, ARCHIVED postings even from APPROVED companies", async () => {
    const co = await makeApprovedCo("status-vis");
    const titles: Array<{ status: "DRAFT" | "PAUSED" | "CLOSED" | "ARCHIVED"; title: string }> = [
      { status: "DRAFT", title: `Status DRAFT ${RUN_ID}` },
      { status: "PAUSED", title: `Status PAUSED ${RUN_ID}` },
      { status: "CLOSED", title: `Status CLOSED ${RUN_ID}` },
      { status: "ARCHIVED", title: `Status ARCHIVED ${RUN_ID}` },
    ];
    for (const t of titles) {
      // Service won't accept ARCHIVED via the typed API — write directly.
      await prisma.jobPosting.create({
        data: {
          companyProfileId: co.companyProfileId,
          slug: `${RUN_ID}-${t.status.toLowerCase()}`,
          title: t.title,
          workplaceType: "REMOTE",
          description: "x",
          status: t.status,
        },
      });
    }
    for (const t of titles) {
      const visible = await searchPublicJobPostings({ keyword: t.title });
      expect(visible).toHaveLength(0);
    }
  });

  it("excludes a soft-deleted posting", async () => {
    const co = await makeApprovedCo("soft-vis");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Soft delete vis ${RUN_ID}`,
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");

    let visible = await searchPublicJobPostings({
      keyword: "Soft delete vis",
    });
    expect(visible.some((r) => r.id === created.id)).toBe(true);

    await softDeleteJobPosting(co.userId, created.id);
    visible = await searchPublicJobPostings({ keyword: "Soft delete vis" });
    expect(visible.some((r) => r.id === created.id)).toBe(false);
  });

  it("excludes postings owned by a soft-deleted company", async () => {
    const co = await makeApprovedCo("soft-co-vis");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Soft co vis ${RUN_ID}`,
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { deletedAt: new Date() },
    });

    const visible = await searchPublicJobPostings({
      keyword: "Soft co vis",
    });
    expect(visible.some((r) => r.id === created.id)).toBe(false);
  });
});

describe.skipIf(skip)("searchPublicJobPostings · filters", () => {
  it("filters by workplaceType", async () => {
    const co = await makeApprovedCo("wt");
    const remote = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `WT Remote ${RUN_ID}`,
      description: "Body.",
      workplaceType: "REMOTE",
    });
    const onsite = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `WT Onsite ${RUN_ID}`,
      description: "Body.",
      workplaceType: "ONSITE",
    });
    if (!remote.ok || !onsite.ok) throw new Error("setup failed");

    const onlyRemote = await searchPublicJobPostings({
      keyword: `WT `,
      workplaceType: "REMOTE",
    });
    const ids = onlyRemote.map((r) => r.id);
    expect(ids).toContain(remote.id);
    expect(ids).not.toContain(onsite.id);
  });

  it("filters by internshipTerm", async () => {
    const co = await makeApprovedCo("term");
    const summer = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Term Summer ${RUN_ID}`,
      description: "Body.",
      internshipTerm: "SUMMER",
    });
    const fall = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Term Fall ${RUN_ID}`,
      description: "Body.",
      internshipTerm: "FALL",
    });
    if (!summer.ok || !fall.ok) throw new Error("setup failed");

    const onlyFall = await searchPublicJobPostings({
      keyword: `Term `,
      internshipTerm: "FALL",
    });
    const ids = onlyFall.map((r) => r.id);
    expect(ids).toContain(fall.id);
    expect(ids).not.toContain(summer.id);
  });

  it("filters by compensationType", async () => {
    const co = await makeApprovedCo("comp");
    const paid = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Comp Paid ${RUN_ID}`,
      description: "Body.",
      compensationType: "PAID",
    });
    const unpaid = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Comp Unpaid ${RUN_ID}`,
      description: "Body.",
      compensationType: "UNPAID",
    });
    if (!paid.ok || !unpaid.ok) throw new Error("setup failed");

    const onlyPaid = await searchPublicJobPostings({
      keyword: `Comp `,
      compensationType: "PAID",
    });
    const ids = onlyPaid.map((r) => r.id);
    expect(ids).toContain(paid.id);
    expect(ids).not.toContain(unpaid.id);
  });

  it("keyword search hits both title and description, case-insensitive", async () => {
    const co = await makeApprovedCo("kw");
    const titleHit = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `${RUN_ID} TitleHaystack`,
      description: "Body.",
    });
    const bodyHit = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `${RUN_ID} other`,
      description: `Look in body for ${RUN_ID}-bodyhaystack here.`,
    });
    if (!titleHit.ok || !bodyHit.ok) throw new Error("setup failed");

    const titleResults = await searchPublicJobPostings({
      keyword: "titlehaystack", // lowercase
    });
    const bodyResults = await searchPublicJobPostings({
      keyword: `${RUN_ID}-BODYHAYSTACK`, // uppercase
    });

    expect(titleResults.some((r) => r.id === titleHit.id)).toBe(true);
    expect(bodyResults.some((r) => r.id === bodyHit.id)).toBe(true);
  });

  it("countPublicJobPostings agrees with searchPublicJobPostings under the same filters", async () => {
    const filters = { keyword: `${RUN_ID} TitleHaystack` };
    const list = await searchPublicJobPostings(filters);
    const count = await countPublicJobPostings(filters);
    expect(count).toBe(list.length);
  });
});

describe.skipIf(skip)("getPublicJobPostingBySlugs · 404 cases", () => {
  it("returns the posting when company is APPROVED + status PUBLISHED", async () => {
    const co = await makeApprovedCo("get-ok");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Get OK",
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    const r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).not.toBeNull();
    expect(r?.id).toBe(created.id);
  });

  it("returns null for a DRAFT posting (even on APPROVED company)", async () => {
    const co = await makeApprovedCo("get-draft");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Get Draft",
      description: "Body.",
      status: "DRAFT",
    });
    if (!created.ok) throw new Error("setup failed");
    const r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();
  });

  it("returns null for a posting under a PENDING company", async () => {
    const co = await makePendingCo("get-pending");
    // Pending can't publish via the gate; force a PUBLISHED row directly
    // to prove the visibility filter, not the publish gate, blocks it.
    const row = await prisma.jobPosting.create({
      data: {
        companyProfileId: co.companyProfileId,
        slug: "get-pending-direct",
        title: "Get Pending Direct",
        workplaceType: "REMOTE",
        description: "Body.",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const r = await getPublicJobPostingBySlugs(co.companySlug, row.slug);
    expect(r).toBeNull();
  });

  it("returns null for a posting under a SUSPENDED company", async () => {
    const co = await makeApprovedCo("get-suspend");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Get Suspend",
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    await setCompanyApprovalStatus(
      co.adminId,
      co.companyProfileId,
      "SUSPENDED",
    );
    const r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();
  });

  it("returns null for a soft-deleted posting", async () => {
    const co = await makeApprovedCo("get-soft");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Get Soft",
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    await softDeleteJobPosting(co.userId, created.id);
    const r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();
  });

  it("returns null when an APPROVED company is then soft-deleted", async () => {
    const co = await makeApprovedCo("get-co-soft");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Get Co Soft",
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { deletedAt: new Date() },
    });
    const r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();
  });

  it("returns null for an unknown (companySlug, jobSlug) pair", async () => {
    expect(
      await getPublicJobPostingBySlugs("no-such-company", "no-such-job"),
    ).toBeNull();
  });

  it("returns null for the right posting under the wrong companySlug", async () => {
    const a = await makeApprovedCo("pair-a");
    const b = await makeApprovedCo("pair-b");
    const created = await createJobPosting(a.userId, {
      ...POSTING_BASE,
      title: "Wrong Pair",
      description: "Body.",
    });
    if (!created.ok) throw new Error("setup failed");
    // The slug exists, but under company A — looking up under B's slug
    // must not find it even though B is also APPROVED.
    const r = await getPublicJobPostingBySlugs(b.companySlug, created.slug);
    expect(r).toBeNull();
  });
});

describe.skipIf(skip)("getPublicCompanyBySlug", () => {
  it("returns an APPROVED company with their PUBLISHED postings", async () => {
    const co = await makeApprovedCo("co-public");
    await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Co Public Posting",
      description: "Body.",
    });
    const r = await getPublicCompanyBySlug(co.companySlug);
    expect(r).not.toBeNull();
    expect(r?.jobPostings.some((p) => p.title === "Co Public Posting")).toBe(
      true,
    );
  });

  it("returns null for a PENDING company", async () => {
    const co = await makePendingCo("co-pending");
    expect(await getPublicCompanyBySlug(co.companySlug)).toBeNull();
  });

  it("does not include DRAFT postings on the company page", async () => {
    const co = await makeApprovedCo("co-mixed");
    await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Co Mixed Published",
      description: "Body.",
    });
    await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: "Co Mixed Draft",
      description: "Body.",
      status: "DRAFT",
    });
    const r = await getPublicCompanyBySlug(co.companySlug);
    const titles = r?.jobPostings.map((p) => p.title) ?? [];
    expect(titles).toContain("Co Mixed Published");
    expect(titles).not.toContain("Co Mixed Draft");
  });
});

describe.skipIf(skip)("publish gate + reverts: visibility tracks state", () => {
  it("a DRAFT→PUBLISHED transition makes the posting publicly visible", async () => {
    const co = await makeApprovedCo("transit");
    const created = await createJobPosting(co.userId, {
      ...POSTING_BASE,
      title: `Transit ${RUN_ID}`,
      description: "Body.",
      status: "DRAFT",
    });
    if (!created.ok) throw new Error("setup failed");
    let r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();

    await updateJobPosting(co.userId, created.id, {
      ...POSTING_BASE,
      title: `Transit ${RUN_ID}`,
      description: "Body.",
      status: "PUBLISHED",
    });
    r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).not.toBeNull();

    // Reverting to DRAFT pulls it back out of public view.
    await updateJobPosting(co.userId, created.id, {
      ...POSTING_BASE,
      title: `Transit ${RUN_ID}`,
      description: "Body.",
      status: "DRAFT",
    });
    r = await getPublicJobPostingBySlugs(co.companySlug, created.slug);
    expect(r).toBeNull();
  });
});
