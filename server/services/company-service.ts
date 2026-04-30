import "server-only";

import { calculateCompanyCompleteness } from "@/lib/companies/completeness";
import { prisma } from "@/lib/db/client";
import type { CompanyBasicsInput } from "@/features/companies/schemas";

export type SaveCompanyResult =
  | {
      ok: true;
      companyProfileId: string;
      isComplete: boolean;
      isFirstSave: boolean;
    }
  | { ok: false; reason: "slug_taken" };

/** Read the active CompanyProfile for the given user. */
export async function getCompanyProfileByUserId(userId: string) {
  return prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
  });
}

/** Read by slug — used by public pages later. Soft-delete aware. */
export async function getCompanyProfileBySlug(slug: string) {
  return prisma.companyProfile.findFirst({
    where: { slug, deletedAt: null },
  });
}

/**
 * Slugify a company name. Lowercases, replaces non-alphanumerics with
 * dashes, trims leading/trailing dashes, caps length. Conservative —
 * we'd rather collide than emit something weird, and the caller layers
 * on a uniqueness retry.
 */
export function slugifyCompanyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : "company";
}

/**
 * Generate a unique active slug, appending `-2`, `-3`, ... until one
 * isn't taken. The schema's partial unique index lets soft-deleted
 * slugs be reused, so we only check active rows.
 */
async function ensureUniqueSlug(
  candidate: string,
  ignoreCompanyProfileId?: string,
): Promise<string> {
  let slug = candidate;
  let suffix = 1;
  // 50 is a generous upper bound to keep the loop bounded; in practice
  // collisions on a marketplace this small are vanishingly rare.
  for (let i = 0; i < 50; i++) {
    const existing = await prisma.companyProfile.findFirst({
      where: {
        slug,
        deletedAt: null,
        NOT: ignoreCompanyProfileId
          ? { id: ignoreCompanyProfileId }
          : undefined,
      },
      select: { id: true },
    });
    if (!existing) return slug;
    suffix++;
    slug = `${candidate}-${suffix}`;
  }
  throw new Error("Could not generate a unique company slug.");
}

/**
 * Create-or-update the company profile. Owner is determined by the
 * session userId — there's no way for a caller to spoof another
 * company's profile.
 *
 * **Never touches `approvalStatus`.** Approval state is admin-only
 * (Task 8). Saving a complete profile must not change moderation state.
 */
export async function upsertCompanyProfile(
  userId: string,
  input: CompanyBasicsInput,
): Promise<SaveCompanyResult> {
  const existing = await getCompanyProfileByUserId(userId);
  const isFirstSave = existing == null;

  // Slug is derived on first save; subsequent saves keep the existing
  // slug so URLs don't break out from under students who bookmarked
  // them. (Admin-driven slug edits are a future concern.)
  const slug = existing
    ? existing.slug
    : await ensureUniqueSlug(slugifyCompanyName(input.companyName));

  const data = {
    companyName: input.companyName,
    slug,
    industry: input.industry,
    companySize: input.companySize,
    headquarters: input.headquarters,
    shortDescription: input.shortDescription,
    description: input.description,
    contactEmail: input.contactEmail,
    websiteUrl: input.websiteUrl,
    programTag: input.programTag,
  };

  function isSlugCollision(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    );
  }

  let companyProfileId: string;
  if (existing) {
    // Update path: slug doesn't change on edits, so a P2002 here would
    // mean something genuinely unexpected — surface it.
    const updated = await prisma.companyProfile.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
    companyProfileId = updated.id;
  } else {
    // Create path: under concurrency, two parallel signups can both
    // resolve the same fresh slug from `ensureUniqueSlug` before either
    // commits. The DB unique index catches it; we re-resolve and retry
    // a small bounded number of times so the user-facing flow recovers
    // transparently. Only after persistent collisions do we surface
    // `slug_taken`.
    const MAX_RETRIES = 5;
    let attempt = 0;
    let createInput = { userId, ...data };
    while (true) {
      try {
        const created = await prisma.companyProfile.create({
          // approvalStatus intentionally NOT specified — schema default
          // (PENDING) applies on creation; updates leave it untouched.
          data: createInput,
          select: { id: true },
        });
        companyProfileId = created.id;
        break;
      } catch (err: unknown) {
        if (!isSlugCollision(err)) throw err;
        attempt++;
        if (attempt >= MAX_RETRIES) {
          return { ok: false, reason: "slug_taken" };
        }
        // Re-resolve with the now-conflicting active rows in mind.
        const nextSlug = await ensureUniqueSlug(
          slugifyCompanyName(input.companyName),
        );
        createInput = { ...createInput, slug: nextSlug };
      }
    }
  }

  const fresh = await prisma.companyProfile.findUniqueOrThrow({
    where: { id: companyProfileId },
    select: {
      companyName: true,
      slug: true,
      industry: true,
      companySize: true,
      headquarters: true,
      shortDescription: true,
      description: true,
      contactEmail: true,
    },
  });
  const { isComplete } = calculateCompanyCompleteness(fresh);

  return { ok: true, companyProfileId, isComplete, isFirstSave };
}

/**
 * Persist a logo storage key. Used by the logo upload action after the
 * storage adapter writes the file. Strictly owner-scoped.
 */
export async function setLogoStorageKey(
  userId: string,
  key: string | null,
): Promise<void> {
  const existing = await getCompanyProfileByUserId(userId);
  if (!existing) {
    // No profile yet — create a minimal placeholder row using the user's
    // email prefix as a starting company name, so the upload can land
    // somewhere. The user's first basics save will overwrite the name.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const companyName = user.email.split("@")[0];
    const slug = await ensureUniqueSlug(slugifyCompanyName(companyName));
    await prisma.companyProfile.create({
      data: {
        userId,
        companyName,
        slug,
        logoStorageKey: key,
      },
    });
    return;
  }
  await prisma.companyProfile.update({
    where: { id: existing.id },
    data: { logoStorageKey: key },
  });
}

/**
 * True iff the user owns the given storage key. Logos are public-read,
 * but DELETE / replace operations are still owner-only — so this check
 * gates write paths, not the public read route.
 */
export async function ownsLogoStorageKey(
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const profile = await prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { logoStorageKey: true },
  });
  return profile?.logoStorageKey === storageKey;
}
