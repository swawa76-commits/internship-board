// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // Cascade cleans up profiles, applications, etc.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skipIfNoDb = !process.env.DATABASE_URL;

describe.skipIf(skipIfNoDb)("Schema integration: soft-delete-safe uniqueness", () => {
  it("rejects a duplicate active email on User", async () => {
    const email = `${RUN_ID}-dup@test.local`;
    const u1 = await prisma.user.create({
      data: { email, role: "STUDENT" },
    });
    createdUserIds.push(u1.id);

    await expect(
      prisma.user.create({ data: { email, role: "COMPANY" } }),
    ).rejects.toThrow();
  });

  it("allows reusing a User email after soft delete", async () => {
    const email = `${RUN_ID}-reuse@test.local`;
    const u1 = await prisma.user.create({
      data: { email, role: "STUDENT" },
    });
    createdUserIds.push(u1.id);

    await prisma.user.update({
      where: { id: u1.id },
      data: { deletedAt: new Date() },
    });

    const u2 = await prisma.user.create({
      data: { email, role: "COMPANY" },
    });
    createdUserIds.push(u2.id);

    expect(u2.id).not.toEqual(u1.id);
    expect(u2.email).toEqual(email);
  });

  it("allows reusing a CompanyProfile slug after soft delete", async () => {
    const slug = `${RUN_ID}-slug`;

    const owner1 = await prisma.user.create({
      data: { email: `${RUN_ID}-owner1@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner1.id);
    const c1 = await prisma.companyProfile.create({
      data: { userId: owner1.id, companyName: "Acme A", slug },
    });

    const owner2 = await prisma.user.create({
      data: { email: `${RUN_ID}-owner2@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner2.id);

    // Active duplicate must fail.
    await expect(
      prisma.companyProfile.create({
        data: { userId: owner2.id, companyName: "Acme B", slug },
      }),
    ).rejects.toThrow();

    // Soft-delete the first, then the slug should be reusable.
    await prisma.companyProfile.update({
      where: { id: c1.id },
      data: { deletedAt: new Date() },
    });

    const c2 = await prisma.companyProfile.create({
      data: { userId: owner2.id, companyName: "Acme B", slug },
    });
    expect(c2.id).not.toEqual(c1.id);
    expect(c2.slug).toEqual(slug);
  });

  it("allows reusing a JobPosting slug per company after soft delete", async () => {
    const owner = await prisma.user.create({
      data: { email: `${RUN_ID}-jp-owner@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner.id);
    const company = await prisma.companyProfile.create({
      data: {
        userId: owner.id,
        companyName: "JP Co",
        slug: `${RUN_ID}-jp-co`,
      },
    });

    const slug = `intern-role`;
    const j1 = await prisma.jobPosting.create({
      data: {
        companyProfileId: company.id,
        slug,
        title: "Intern A",
        workplaceType: "REMOTE",
        description: "First posting",
      },
    });

    // Active duplicate within the same company must fail.
    await expect(
      prisma.jobPosting.create({
        data: {
          companyProfileId: company.id,
          slug,
          title: "Intern B",
          workplaceType: "REMOTE",
          description: "Should not be allowed",
        },
      }),
    ).rejects.toThrow();

    // Soft-delete first posting, then reuse the slug.
    await prisma.jobPosting.update({
      where: { id: j1.id },
      data: { deletedAt: new Date() },
    });
    const j2 = await prisma.jobPosting.create({
      data: {
        companyProfileId: company.id,
        slug,
        title: "Intern B",
        workplaceType: "REMOTE",
        description: "Reused after soft delete",
      },
    });
    expect(j2.id).not.toEqual(j1.id);
    expect(j2.slug).toEqual(slug);
  });
});

describe.skipIf(skipIfNoDb)("Schema integration: enum + relation invariants", () => {
  it("defaults a CompanyProfile to PENDING approval", async () => {
    const owner = await prisma.user.create({
      data: { email: `${RUN_ID}-pending@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner.id);
    const c = await prisma.companyProfile.create({
      data: { userId: owner.id, companyName: "Pending Co", slug: `${RUN_ID}-pending` },
    });
    expect(c.approvalStatus).toEqual("PENDING");
  });

  it("defaults a JobPosting to DRAFT status", async () => {
    const owner = await prisma.user.create({
      data: { email: `${RUN_ID}-draft@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner.id);
    const company = await prisma.companyProfile.create({
      data: { userId: owner.id, companyName: "Draft Co", slug: `${RUN_ID}-draft` },
    });
    const job = await prisma.jobPosting.create({
      data: {
        companyProfileId: company.id,
        slug: `draft-role`,
        title: "Draft role",
        workplaceType: "ONSITE",
        description: "Draft",
      },
    });
    expect(job.status).toEqual("DRAFT");
  });

  it("rejects a duplicate Application for the same student/job pair", async () => {
    const studentUser = await prisma.user.create({
      data: { email: `${RUN_ID}-student@test.local`, role: "STUDENT" },
    });
    createdUserIds.push(studentUser.id);
    const studentProfile = await prisma.studentProfile.create({
      data: { userId: studentUser.id, fullName: "Test Student" },
    });

    const owner = await prisma.user.create({
      data: { email: `${RUN_ID}-app-co@test.local`, role: "COMPANY" },
    });
    createdUserIds.push(owner.id);
    const company = await prisma.companyProfile.create({
      data: { userId: owner.id, companyName: "App Co", slug: `${RUN_ID}-app-co` },
    });
    const job = await prisma.jobPosting.create({
      data: {
        companyProfileId: company.id,
        slug: `app-role`,
        title: "App role",
        workplaceType: "REMOTE",
        description: "Apply here",
      },
    });

    await prisma.application.create({
      data: { jobPostingId: job.id, studentProfileId: studentProfile.id },
    });
    await expect(
      prisma.application.create({
        data: { jobPostingId: job.id, studentProfileId: studentProfile.id },
      }),
    ).rejects.toThrow();
  });
});
