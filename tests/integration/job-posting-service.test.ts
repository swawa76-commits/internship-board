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
  getJobPostingByIdForCompany,
  listJobPostingsForCompany,
  slugifyJobTitle,
  softDeleteJobPosting,
  updateJobPosting,
} from "@/server/services/job-posting-service";
import { publicJobPostingVisibilityWhere } from "@/server/services/visibility-service";

const RUN_ID = `jp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const COMPANY_PROFILE_INPUT = {
  companyName: "",
  industry: "Software",
  companySize: "11-50",
  headquarters: "Remote",
  shortDescription: "Test co for job posting suite.",
  description: "Used by integration tests; not a real company.",
  contactEmail: "talent@test.local",
  websiteUrl: null,
  programTag: null,
};

const VALID_FORM_INPUT = {
  title: "Software Engineering Intern",
  department: "Engineering",
  location: "Remote",
  workplaceType: "REMOTE" as const,
  internshipTerm: "SUMMER" as const,
  startDate: new Date("2026-06-01"),
  duration: "12 weeks",
  compensationType: "PAID" as const,
  compensationMin: 30,
  compensationMax: 45,
  description: "Work alongside senior engineers on a real product.",
  responsibilities: "Pair with mentors; ship a feature.",
  qualifications: "Curiosity, basic CS fundamentals.",
  applicationDeadline: new Date("2026-04-01"),
  programTag: null,
  status: "DRAFT" as const,
};

async function makeApprovedCompany(suffix: string) {
  const adminUser = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(adminUser.id);

  const companyUser = await createUserWithCredentials({
    email: `${RUN_ID}-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!companyUser.ok) throw new Error("setup failed");
  createdUserIds.push(companyUser.userId);

  const result = await upsertCompanyProfile(companyUser.userId, {
    ...COMPANY_PROFILE_INPUT,
    companyName: `Co ${suffix}`,
  });
  if (!result.ok) throw new Error("profile setup failed");

  await setCompanyApprovalStatus(
    adminUser.id,
    result.companyProfileId,
    "APPROVED",
  );

  return {
    userId: companyUser.userId,
    companyProfileId: result.companyProfileId,
    adminId: adminUser.id,
  };
}

async function makePendingCompany(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  const result = await upsertCompanyProfile(r.userId, {
    ...COMPANY_PROFILE_INPUT,
    companyName: `Co ${suffix}`,
  });
  if (!result.ok) throw new Error("profile setup failed");
  return { userId: r.userId, companyProfileId: result.companyProfileId };
}

describe("slugifyJobTitle (pure helper)", () => {
  it("dashes alphanumerics and lowercases", () => {
    expect(slugifyJobTitle("Software Engineering Intern")).toBe(
      "software-engineering-intern",
    );
  });
  it("collapses runs of non-alphanumerics", () => {
    expect(slugifyJobTitle("Backend (Go)  Intern!")).toBe("backend-go-intern");
  });
  it("falls back to 'posting' for empty result", () => {
    expect(slugifyJobTitle("!!!")).toBe("posting");
  });
});

describe.skipIf(skip)("createJobPosting", () => {
  it("creates a DRAFT for a PENDING company (no publish gate triggered)", async () => {
    const co = await makePendingCompany("create-draft");
    const r = await createJobPosting(co.userId, VALID_FORM_INPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slug).toBe("software-engineering-intern");

    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: r.id },
      select: { status: true, publishedAt: true },
    });
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.publishedAt).toBeNull();
  });

  it("creates and publishes a posting for an APPROVED company", async () => {
    const co = await makeApprovedCompany("create-published");
    const r = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: r.id },
      select: { status: true, publishedAt: true },
    });
    expect(fresh.status).toBe("PUBLISHED");
    expect(fresh.publishedAt).not.toBeNull();
  });

  it("rejects PUBLISHED on a PENDING company with publish_blocked", async () => {
    const co = await makePendingCompany("create-blocked");
    const r = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("publish_blocked");

    // No row should have been written.
    const count = await prisma.jobPosting.count({
      where: { companyProfileId: co.companyProfileId, deletedAt: null },
    });
    expect(count).toBe(0);
  });

  it("rejects PUBLISHED on a SUSPENDED company", async () => {
    const co = await makeApprovedCompany("create-suspended");
    await setCompanyApprovalStatus(
      co.adminId,
      co.companyProfileId,
      "SUSPENDED",
    );
    const r = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("publish_blocked");
  });

  it("rejects with not_onboarded when the user has no company profile", async () => {
    const noProfile = await createUserWithCredentials({
      email: `${RUN_ID}-noprofile@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!noProfile.ok) throw new Error("setup failed");
    createdUserIds.push(noProfile.userId);

    const r = await createJobPosting(noProfile.userId, VALID_FORM_INPUT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_onboarded");
  });

  it("disambiguates slugs within the same company", async () => {
    const co = await makePendingCompany("slug-dup");
    const a = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      title: "Same Title",
    });
    const b = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      title: "Same Title",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.slug).toBe("same-title");
    expect(b.slug).toBe("same-title-2");
  });

  it("allows the same slug across two different companies (uniqueness is per-company)", async () => {
    const a = await makePendingCompany("slug-multi-a");
    const b = await makePendingCompany("slug-multi-b");
    const ra = await createJobPosting(a.userId, {
      ...VALID_FORM_INPUT,
      title: "Twin Role",
    });
    const rb = await createJobPosting(b.userId, {
      ...VALID_FORM_INPUT,
      title: "Twin Role",
    });
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(ra.slug).toBe("twin-role");
    expect(rb.slug).toBe("twin-role");
  });

  it("transparently retries on a parallel slug-race within one company", async () => {
    const co = await makePendingCompany("slug-race");
    const [a, b] = await Promise.all([
      createJobPosting(co.userId, { ...VALID_FORM_INPUT, title: "Race Role" }),
      createJobPosting(co.userId, { ...VALID_FORM_INPUT, title: "Race Role" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.slug).not.toBe(b.slug);
  });
});

describe.skipIf(skip)("updateJobPosting", () => {
  it("updates owned posting and stamps publishedAt on first publish", async () => {
    const co = await makeApprovedCompany("update-publish");
    const created = await createJobPosting(co.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");

    const updated = await updateJobPosting(co.userId, created.id, {
      ...VALID_FORM_INPUT,
      title: "Updated Title",
      status: "PUBLISHED",
    });
    expect(updated.ok).toBe(true);

    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { title: true, status: true, publishedAt: true, slug: true },
    });
    expect(fresh.title).toBe("Updated Title");
    expect(fresh.status).toBe("PUBLISHED");
    expect(fresh.publishedAt).not.toBeNull();
    // Slug is stable on edits.
    expect(fresh.slug).toBe(created.slug);
  });

  it("clears publishedAt when reverting to DRAFT", async () => {
    const co = await makeApprovedCompany("revert-draft");
    const created = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    if (!created.ok) throw new Error("setup failed");

    await updateJobPosting(co.userId, created.id, {
      ...VALID_FORM_INPUT,
      status: "DRAFT",
    });

    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, publishedAt: true },
    });
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.publishedAt).toBeNull();
  });

  it("rejects DRAFT -> PUBLISHED transition for a PENDING company", async () => {
    const co = await makePendingCompany("update-blocked");
    const created = await createJobPosting(co.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");

    const r = await updateJobPosting(co.userId, created.id, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("publish_blocked");

    // The row stays at DRAFT.
    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true },
    });
    expect(fresh.status).toBe("DRAFT");
  });

  it("rejects update of a posting belonging to another company", async () => {
    const owner = await makePendingCompany("own-edit");
    const attacker = await makePendingCompany("attacker-edit");
    const created = await createJobPosting(owner.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");

    const r = await updateJobPosting(attacker.userId, created.id, {
      ...VALID_FORM_INPUT,
      title: "Hijacked",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");

    // Original title preserved.
    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { title: true },
    });
    expect(fresh.title).toBe(VALID_FORM_INPUT.title);
  });

  it("rejects update of a non-existent posting", async () => {
    const co = await makePendingCompany("update-missing");
    const r = await updateJobPosting(
      co.userId,
      "ckXXXXXXXXXXXXXXXXXXXXXXX",
      VALID_FORM_INPUT,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });

  it("rejects update of a soft-deleted posting", async () => {
    const co = await makePendingCompany("update-deleted");
    const created = await createJobPosting(co.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");
    await softDeleteJobPosting(co.userId, created.id);

    const r = await updateJobPosting(co.userId, created.id, VALID_FORM_INPUT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });
});

describe.skipIf(skip)("listJobPostingsForCompany / getJobPostingByIdForCompany", () => {
  it("lists only the calling company's postings, soft-deleted excluded", async () => {
    const a = await makePendingCompany("list-a");
    const b = await makePendingCompany("list-b");
    const aPosting = await createJobPosting(a.userId, {
      ...VALID_FORM_INPUT,
      title: "A's role",
    });
    if (!aPosting.ok) throw new Error("setup failed");
    const bPosting = await createJobPosting(b.userId, {
      ...VALID_FORM_INPUT,
      title: "B's role",
    });
    if (!bPosting.ok) throw new Error("setup failed");
    const deleted = await createJobPosting(a.userId, {
      ...VALID_FORM_INPUT,
      title: "Soon to be deleted",
    });
    if (!deleted.ok) throw new Error("setup failed");
    await softDeleteJobPosting(a.userId, deleted.id);

    const aList = await listJobPostingsForCompany(a.userId);
    const aIds = new Set(aList.map((r) => r.id));
    expect(aIds.has(aPosting.id)).toBe(true);
    expect(aIds.has(bPosting.id)).toBe(false);
    expect(aIds.has(deleted.id)).toBe(false);
  });

  it("getJobPostingByIdForCompany returns null for a posting owned by another company", async () => {
    const owner = await makePendingCompany("own-read");
    const attacker = await makePendingCompany("attacker-read");
    const created = await createJobPosting(owner.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");

    expect(
      await getJobPostingByIdForCompany(attacker.userId, created.id),
    ).toBeNull();
    expect(
      await getJobPostingByIdForCompany(owner.userId, created.id),
    ).not.toBeNull();
  });

  it("getJobPostingByIdForCompany excludes soft-deleted rows", async () => {
    const co = await makePendingCompany("read-deleted");
    const created = await createJobPosting(co.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");
    await softDeleteJobPosting(co.userId, created.id);

    expect(
      await getJobPostingByIdForCompany(co.userId, created.id),
    ).toBeNull();
  });
});

describe.skipIf(skip)("softDeleteJobPosting", () => {
  it("soft-deletes the row and removes it from public visibility", async () => {
    const co = await makeApprovedCompany("soft-delete");
    const created = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      status: "PUBLISHED",
    });
    if (!created.ok) throw new Error("setup failed");

    // Visible before delete.
    let visible = await prisma.jobPosting.findMany({
      where: { ...publicJobPostingVisibilityWhere(), id: created.id },
      select: { id: true },
    });
    expect(visible).toHaveLength(1);

    const r = await softDeleteJobPosting(co.userId, created.id);
    expect(r.ok).toBe(true);

    // Hidden after delete.
    visible = await prisma.jobPosting.findMany({
      where: { ...publicJobPostingVisibilityWhere(), id: created.id },
      select: { id: true },
    });
    expect(visible).toHaveLength(0);

    // deletedAt is stamped.
    const row = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    expect(row.deletedAt).not.toBeNull();
  });

  it("rejects deletion by a different company with forbidden", async () => {
    const owner = await makePendingCompany("own-delete");
    const attacker = await makePendingCompany("attacker-delete");
    const created = await createJobPosting(owner.userId, VALID_FORM_INPUT);
    if (!created.ok) throw new Error("setup failed");

    const r = await softDeleteJobPosting(attacker.userId, created.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");

    const fresh = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    expect(fresh.deletedAt).toBeNull();
  });

  it("rejects deletion of a non-existent posting", async () => {
    const co = await makePendingCompany("delete-missing");
    const r = await softDeleteJobPosting(
      co.userId,
      "ckXXXXXXXXXXXXXXXXXXXXXXX",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });

  it("allows the slug to be reused after soft delete", async () => {
    const co = await makePendingCompany("slug-reuse");
    const first = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      title: "Reusable",
    });
    if (!first.ok) throw new Error("setup failed");
    expect(first.slug).toBe("reusable");

    await softDeleteJobPosting(co.userId, first.id);

    const second = await createJobPosting(co.userId, {
      ...VALID_FORM_INPUT,
      title: "Reusable",
    });
    if (!second.ok) throw new Error("setup failed");
    expect(second.slug).toBe("reusable");
    expect(second.id).not.toBe(first.id);
  });
});
