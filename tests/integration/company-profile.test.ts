// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { createUserWithCredentials } from "@/server/services/auth-service";
import {
  getCompanyProfileByUserId,
  getCompanyProfileBySlug,
  ownsLogoStorageKey,
  setLogoStorageKey,
  slugifyCompanyName,
  upsertCompanyProfile,
} from "@/server/services/company-service";
import { needsCompanyOnboarding } from "@/server/services/onboarding-service";

const RUN_ID = `co${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

async function makeCompany(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  return r.userId;
}

const COMPLETE_INPUT = {
  companyName: "Acme Test Co",
  industry: "Robotics",
  companySize: "11-50",
  headquarters: "Pittsburgh, PA",
  shortDescription: "Industrial automation built for small factories.",
  description:
    "We build pick-and-place robotic arms tuned for small factories that have outgrown their CNC operators.",
  contactEmail: "talent@test.local",
  websiteUrl: null,
  programTag: null,
};

describe("slugifyCompanyName (pure helper)", () => {
  it("lowercases and dashes alphanumerics", () => {
    expect(slugifyCompanyName("Acme Robotics")).toBe("acme-robotics");
  });

  it("collapses runs of non-alphanumerics into a single dash", () => {
    expect(slugifyCompanyName("A & B   Co.")).toBe("a-b-co");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugifyCompanyName("--Hello--")).toBe("hello");
  });

  it("falls back to 'company' when input collapses to empty", () => {
    expect(slugifyCompanyName("!!!")).toBe("company");
  });
});

describe.skipIf(skip)("upsertCompanyProfile · create + edit", () => {
  it("creates a profile when none exists and derives a slug from the name", async () => {
    const userId = await makeCompany("create");

    const before = await getCompanyProfileByUserId(userId);
    expect(before).toBeNull();

    const result = await upsertCompanyProfile(userId, COMPLETE_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isFirstSave).toBe(true);
    expect(result.isComplete).toBe(true);

    const after = await getCompanyProfileByUserId(userId);
    expect(after?.companyName).toBe("Acme Test Co");
    expect(after?.slug).toBe("acme-test-co");
  });

  it("updates an existing profile in place without changing the slug", async () => {
    const userId = await makeCompany("edit");
    const first = await upsertCompanyProfile(userId, COMPLETE_INPUT);
    if (!first.ok) throw new Error("setup failed");

    const before = await getCompanyProfileByUserId(userId);
    const originalSlug = before?.slug;

    await upsertCompanyProfile(userId, {
      ...COMPLETE_INPUT,
      companyName: "Renamed Co",
    });

    const after = await getCompanyProfileByUserId(userId);
    expect(after?.companyName).toBe("Renamed Co");
    // Slug stays put on edit so existing URLs don't break.
    expect(after?.slug).toBe(originalSlug);
    // Editing returns isFirstSave: false.
    const second = await upsertCompanyProfile(userId, COMPLETE_INPUT);
    if (!second.ok) throw new Error("expected ok");
    expect(second.isFirstSave).toBe(false);
  });

  it("disambiguates slugs when two companies pick the same name", async () => {
    const userA = await makeCompany("dup-a");
    const userB = await makeCompany("dup-b");
    const a = await upsertCompanyProfile(userA, {
      ...COMPLETE_INPUT,
      companyName: "Twin Co",
    });
    const b = await upsertCompanyProfile(userB, {
      ...COMPLETE_INPUT,
      companyName: "Twin Co",
    });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const profileA = await getCompanyProfileByUserId(userA);
    const profileB = await getCompanyProfileByUserId(userB);
    expect(profileA?.slug).toBe("twin-co");
    expect(profileB?.slug).toBe("twin-co-2");
  });

  it("transparently retries on a slug race when parallel saves collide", async () => {
    // Simulate a true race: both callers slugify to "race-co" and call
    // ensureUniqueSlug at roughly the same time. The DB unique index
    // catches the second commit; the service must re-resolve + retry
    // rather than surfacing slug_taken.
    const userA = await makeCompany("race-a");
    const userB = await makeCompany("race-b");
    const [a, b] = await Promise.all([
      upsertCompanyProfile(userA, {
        ...COMPLETE_INPUT,
        companyName: "Race Co",
      }),
      upsertCompanyProfile(userB, {
        ...COMPLETE_INPUT,
        companyName: "Race Co",
      }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const slugs = await prisma.companyProfile.findMany({
      where: {
        userId: { in: [userA, userB] },
        deletedAt: null,
      },
      select: { slug: true },
    });
    const slugSet = new Set(slugs.map((s) => s.slug));
    expect(slugSet.size).toBe(2); // distinct
    expect(slugSet.has("race-co")).toBe(true);
    expect([...slugSet].some((s) => /^race-co-\d+$/.test(s))).toBe(true);
  });
});

describe.skipIf(skip)(
  "upsertCompanyProfile · approvalStatus invariance",
  () => {
    it("creating a profile starts at PENDING (schema default)", async () => {
      const userId = await makeCompany("default-pending");
      await upsertCompanyProfile(userId, COMPLETE_INPUT);
      const after = await getCompanyProfileByUserId(userId);
      expect(after?.approvalStatus).toBe("PENDING");
    });

    it("does not change approvalStatus when an APPROVED company saves their profile", async () => {
      const userId = await makeCompany("stays-approved");
      await upsertCompanyProfile(userId, COMPLETE_INPUT);
      // Simulate an admin approval (Task 8 will own this for real).
      const before = await getCompanyProfileByUserId(userId);
      await prisma.companyProfile.update({
        where: { id: before!.id },
        data: { approvalStatus: "APPROVED" },
      });

      await upsertCompanyProfile(userId, {
        ...COMPLETE_INPUT,
        companyName: "Approved Co Renamed",
      });
      const after = await getCompanyProfileByUserId(userId);
      expect(after?.approvalStatus).toBe("APPROVED");
    });

    it("does not change approvalStatus when a SUSPENDED company saves their profile", async () => {
      const userId = await makeCompany("stays-suspended");
      await upsertCompanyProfile(userId, COMPLETE_INPUT);
      const before = await getCompanyProfileByUserId(userId);
      await prisma.companyProfile.update({
        where: { id: before!.id },
        data: { approvalStatus: "SUSPENDED" },
      });

      await upsertCompanyProfile(userId, {
        ...COMPLETE_INPUT,
        shortDescription: "Updated tagline.",
      });
      const after = await getCompanyProfileByUserId(userId);
      expect(after?.approvalStatus).toBe("SUSPENDED");
    });
  },
);

describe.skipIf(skip)("upsertCompanyProfile · ownership", () => {
  it("only ever writes to the row owned by the userId arg", async () => {
    const userA = await makeCompany("own-a");
    const userB = await makeCompany("own-b");
    await upsertCompanyProfile(userA, {
      ...COMPLETE_INPUT,
      companyName: "Co A",
    });
    await upsertCompanyProfile(userB, {
      ...COMPLETE_INPUT,
      companyName: "Co B",
    });

    // userA's edit cannot touch userB's profile.
    await upsertCompanyProfile(userA, {
      ...COMPLETE_INPUT,
      companyName: "Co A Renamed",
    });
    const a = await getCompanyProfileByUserId(userA);
    const b = await getCompanyProfileByUserId(userB);
    expect(a?.companyName).toBe("Co A Renamed");
    expect(b?.companyName).toBe("Co B");
  });

  it("ownsLogoStorageKey returns true only for the owning user", async () => {
    const userA = await makeCompany("logo-owner");
    const userB = await makeCompany("logo-attacker");
    await upsertCompanyProfile(userA, COMPLETE_INPUT);
    await setLogoStorageKey(userA, "logos/owned.png");

    expect(await ownsLogoStorageKey(userA, "logos/owned.png")).toBe(true);
    expect(await ownsLogoStorageKey(userB, "logos/owned.png")).toBe(false);
  });
});

describe.skipIf(skip)("needsCompanyOnboarding · transition", () => {
  it("a brand-new company needs onboarding", async () => {
    const userId = await makeCompany("transit-new");
    expect(await needsCompanyOnboarding(userId)).toBe(true);
  });

  it("a partial save still needs onboarding", async () => {
    const userId = await makeCompany("transit-partial");
    await upsertCompanyProfile(userId, {
      ...COMPLETE_INPUT,
      description: null,
    });
    expect(await needsCompanyOnboarding(userId)).toBe(true);
  });

  it("a full save flips onboarding to done without touching approvalStatus", async () => {
    const userId = await makeCompany("transit-complete");
    await upsertCompanyProfile(userId, COMPLETE_INPUT);
    expect(await needsCompanyOnboarding(userId)).toBe(false);

    const profile = await getCompanyProfileByUserId(userId);
    expect(profile?.approvalStatus).toBe("PENDING");
  });
});

describe.skipIf(skip)("getCompanyProfileBySlug", () => {
  it("returns the row by active slug", async () => {
    const userId = await makeCompany("by-slug");
    await upsertCompanyProfile(userId, {
      ...COMPLETE_INPUT,
      companyName: "Lookup Co",
    });
    const found = await getCompanyProfileBySlug("lookup-co");
    expect(found?.companyName).toBe("Lookup Co");
  });

  it("does not return soft-deleted rows", async () => {
    const userId = await makeCompany("soft-deleted");
    await upsertCompanyProfile(userId, {
      ...COMPLETE_INPUT,
      companyName: "Bye Co",
    });
    const before = await getCompanyProfileBySlug("bye-co");
    expect(before).not.toBeNull();
    await prisma.companyProfile.update({
      where: { id: before!.id },
      data: { deletedAt: new Date() },
    });
    const after = await getCompanyProfileBySlug("bye-co");
    expect(after).toBeNull();
  });
});
