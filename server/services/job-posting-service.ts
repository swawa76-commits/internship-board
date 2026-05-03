import "server-only";

import { prisma } from "@/lib/db/client";
import type { JobPostingFormInput } from "@/features/job-postings/schemas";
import { canCompanyPublishJobsByUserId } from "@/server/services/visibility-service";

/**
 * Job posting CRUD. Strict ownership lives at the service layer:
 *   - Every mutation resolves the actor's owning CompanyProfile from
 *     their session userId. There is no parameter that lets a caller
 *     spoof another company's id.
 *   - Reads also funnel through the same ownership guard so a leaked
 *     id can't be probed.
 *
 * Approval state is read fresh from the DB via the visibility-service
 * primitives (Task 8) — never duplicated, never cached.
 *
 * Soft-delete is the only deletion mode. `deletedAt` is set, and the
 * partial unique index `JobPosting_companyProfileId_slug_active_key`
 * lets a future posting reuse the slug.
 */

export type CreateResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: "not_onboarded" | "publish_blocked" };

export type UpdateResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_found" | "forbidden" | "publish_blocked";
    };

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" };

// ---------- Slugging ----------

const FALLBACK_SLUG = "posting";

export function slugifyJobTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : FALLBACK_SLUG;
}

/**
 * Generate a unique active slug within a company, appending `-2`, `-3`,
 * etc. until one isn't taken. Mirrors `ensureUniqueSlug` in
 * `company-service.ts`. The DB unique index is the authoritative
 * gatekeeper; this helper is a friendly first attempt.
 */
async function ensureUniqueJobPostingSlug(
  companyProfileId: string,
  candidate: string,
  ignoreId?: string,
): Promise<string> {
  let slug = candidate;
  let suffix = 1;
  for (let i = 0; i < 50; i++) {
    const existing = await prisma.jobPosting.findFirst({
      where: {
        companyProfileId,
        slug,
        deletedAt: null,
        NOT: ignoreId ? { id: ignoreId } : undefined,
      },
      select: { id: true },
    });
    if (!existing) return slug;
    suffix++;
    slug = `${candidate}-${suffix}`;
  }
  throw new Error("Could not generate a unique job posting slug.");
}

function isSlugCollision(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// ---------- Ownership helpers ----------

async function resolveCompanyProfileId(
  userId: string,
): Promise<string | null> {
  const profile = await prisma.companyProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  return profile?.id ?? null;
}

/**
 * Loads a posting and confirms it belongs to the calling user's
 * company. Returns the row plus its parent companyProfileId on success,
 * a discriminated error otherwise. Excludes soft-deleted postings.
 */
async function loadOwnedPosting(
  userId: string,
  jobPostingId: string,
): Promise<
  | { ok: true; companyProfileId: string; postingId: string }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const ownerCompanyId = await resolveCompanyProfileId(userId);
  if (!ownerCompanyId) return { ok: false, reason: "forbidden" };

  const posting = await prisma.jobPosting.findFirst({
    where: { id: jobPostingId, deletedAt: null },
    select: { id: true, companyProfileId: true },
  });
  if (!posting) return { ok: false, reason: "not_found" };
  if (posting.companyProfileId !== ownerCompanyId) {
    return { ok: false, reason: "forbidden" };
  }
  return {
    ok: true,
    companyProfileId: ownerCompanyId,
    postingId: posting.id,
  };
}

// ---------- Reads ----------

export type JobPostingListItem = {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED" | "ARCHIVED";
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listJobPostingsForCompany(
  companyUserId: string,
): Promise<JobPostingListItem[]> {
  const companyProfileId = await resolveCompanyProfileId(companyUserId);
  if (!companyProfileId) return [];
  return prisma.jobPosting.findMany({
    where: { companyProfileId, deletedAt: null },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      workplaceType: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getJobPostingByIdForCompany(
  companyUserId: string,
  jobPostingId: string,
) {
  const ownerCompanyId = await resolveCompanyProfileId(companyUserId);
  if (!ownerCompanyId) return null;
  const posting = await prisma.jobPosting.findFirst({
    where: {
      id: jobPostingId,
      companyProfileId: ownerCompanyId,
      deletedAt: null,
    },
  });
  return posting;
}

// ---------- Mutations ----------

async function gateOnPublish(
  userId: string,
  status: JobPostingFormInput["status"],
): Promise<{ ok: true } | { ok: false; reason: "publish_blocked" }> {
  if (status !== "PUBLISHED") return { ok: true };
  const allowed = await canCompanyPublishJobsByUserId(userId);
  return allowed ? { ok: true } : { ok: false, reason: "publish_blocked" };}

export async function createJobPosting(
  companyUserId: string,
  input: JobPostingFormInput,
): Promise<CreateResult> {
  const companyProfileId = await resolveCompanyProfileId(companyUserId);
  if (!companyProfileId) return { ok: false, reason: "not_onboarded" };

  const gate = await gateOnPublish(companyUserId, input.status);
  if (!gate.ok) return gate;

  const candidate = slugifyJobTitle(input.title);
  let slug = await ensureUniqueJobPostingSlug(companyProfileId, candidate);
  const publishedAt = input.status === "PUBLISHED" ? new Date() : null;

  const MAX_RETRIES = 5;
  let attempt = 0;
  while (true) {
    try {
      const created = await prisma.jobPosting.create({
        data: {
          companyProfileId,
          slug,
          title: input.title,
          department: input.department,
          location: input.location,
          workplaceType: input.workplaceType,
          internshipTerm: input.internshipTerm,
          startDate: input.startDate,
          duration: input.duration,
          compensationType: input.compensationType,
          compensationMin: input.compensationMin,
          compensationMax: input.compensationMax,
          description: input.description,
          responsibilities: input.responsibilities,
          qualifications: input.qualifications,
          applicationDeadline: input.applicationDeadline,
          programTag: input.programTag,
          status: input.status,
          publishedAt,
        },
        select: { id: true, slug: true },
      });
      // Audit: emit JOB_POSTING_CREATED, plus JOB_POSTING_PUBLISHED if
      // the posting was created already-public (skipping the draft
      // step). This keeps the feed consistent with the lifecycle
      // transitions emitted in transitionJobPostingStatus / update.
      await prisma.activityEvent.create({
        data: {
          type: "JOB_POSTING_CREATED",
          actorUserId: companyUserId,
          entityType: "JobPosting",
          entityId: created.id,
          metadataJson: { title: input.title, status: input.status },
        },
      });
      if (input.status === "PUBLISHED") {
        await prisma.activityEvent.create({
          data: {
            type: "JOB_POSTING_PUBLISHED",
            actorUserId: companyUserId,
            entityType: "JobPosting",
            entityId: created.id,
          },
        });
      }
      return { ok: true, id: created.id, slug: created.slug };
    } catch (err) {
      if (!isSlugCollision(err)) throw err;
      attempt++;
      if (attempt >= MAX_RETRIES) {
        // Surface as a publish_blocked-shaped failure? No — slug
        // collision is genuinely an internal hiccup; rethrow.
        throw new Error("Could not allocate a unique job posting slug.");
      }
      slug = await ensureUniqueJobPostingSlug(companyProfileId, candidate);
    }
  }
}

export async function updateJobPosting(
  companyUserId: string,
  jobPostingId: string,
  input: JobPostingFormInput,
): Promise<UpdateResult> {
  const owned = await loadOwnedPosting(companyUserId, jobPostingId);
  if (!owned.ok) return owned;

  const gate = await gateOnPublish(companyUserId, input.status);
  if (!gate.ok) return gate;

  // publishedAt: stamp on first publish, leave alone on re-saves of
  // already-published rows, clear when reverting to DRAFT.
  const existing = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: owned.postingId },
    select: { status: true, publishedAt: true },
  });
  let publishedAt: Date | null = existing.publishedAt;
  if (input.status === "PUBLISHED" && existing.status !== "PUBLISHED") {
    publishedAt = new Date();
  } else if (input.status === "DRAFT") {
    publishedAt = null;
  }

  await prisma.jobPosting.update({
    where: { id: owned.postingId },
    data: {
      title: input.title,
      department: input.department,
      location: input.location,
      workplaceType: input.workplaceType,
      internshipTerm: input.internshipTerm,
      startDate: input.startDate,
      duration: input.duration,
      compensationType: input.compensationType,
      compensationMin: input.compensationMin,
      compensationMax: input.compensationMax,
      description: input.description,
      responsibilities: input.responsibilities,
      qualifications: input.qualifications,
      applicationDeadline: input.applicationDeadline,
      programTag: input.programTag,
      status: input.status,
      publishedAt,
    },
  });
  // Audit: catch the rising edge of "first publish via the edit form".
  // Other status changes flow through transitionJobPostingStatus and
  // log there; we don't double-fire from this path.
  if (input.status === "PUBLISHED" && existing.status !== "PUBLISHED") {
    await prisma.activityEvent.create({
      data: {
        type: "JOB_POSTING_PUBLISHED",
        actorUserId: companyUserId,
        entityType: "JobPosting",
        entityId: owned.postingId,
      },
    });
  }
  return { ok: true, id: owned.postingId };
}

/**
 * Lifecycle transitions a company can drive from the dashboard:
 *
 *   PUBLISHED → PAUSED  (temporarily hide while still recruiting)
 *   PUBLISHED → CLOSED  (no longer accepting applicants)
 *   PAUSED    → PUBLISHED  (re-open, gated by approval)
 *   PAUSED    → CLOSED
 *   CLOSED    → ARCHIVED  (long-term hidden, kept for records)
 *
 * Anything outside that table is rejected at the service layer. The
 * "back to DRAFT" path is *not* exposed here — that's an edit-form
 * concern, and reverting a published posting to draft has different
 * UX implications.
 */
export type TransitionTarget = "PAUSED" | "CLOSED" | "ARCHIVED" | "PUBLISHED";

export type TransitionResult =
  | { ok: true; id: string; from: string; to: TransitionTarget }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "publish_blocked"
        | "invalid_transition";
    };

const ALLOWED_TRANSITIONS: Record<string, ReadonlyArray<TransitionTarget>> = {
  PUBLISHED: ["PAUSED", "CLOSED"],
  PAUSED: ["PUBLISHED", "CLOSED"],
  CLOSED: ["ARCHIVED"],
};

export async function transitionJobPostingStatus(
  companyUserId: string,
  jobPostingId: string,
  target: TransitionTarget,
): Promise<TransitionResult> {
  const owned = await loadOwnedPosting(companyUserId, jobPostingId);
  if (!owned.ok) return owned;

  const existing = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: owned.postingId },
    select: { status: true, publishedAt: true },
  });

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(target)) {
    return { ok: false, reason: "invalid_transition" };
  }

  // Re-publishing requires the same approval gate as the edit form.
  if (target === "PUBLISHED") {
    const gate = await gateOnPublish(companyUserId, "PUBLISHED");
    if (!gate.ok) return gate;
  }

  // publishedAt: stamp on first publish, leave alone on re-publish of a
  // previously-published row (the original publish moment is the truth
  // we want to preserve for "newest" sorting in the public list).
  let publishedAt: Date | null = existing.publishedAt;
  if (target === "PUBLISHED" && existing.publishedAt == null) {
    publishedAt = new Date();
  }

  await prisma.jobPosting.update({
    where: { id: owned.postingId },
    data: { status: target, publishedAt },
  });

  const TRANSITION_EVENT = {
    PUBLISHED: "JOB_POSTING_PUBLISHED",
    PAUSED: "JOB_POSTING_PAUSED",
    CLOSED: "JOB_POSTING_CLOSED",
    ARCHIVED: "JOB_POSTING_ARCHIVED",
  } as const;
  await prisma.activityEvent.create({
    data: {
      type: TRANSITION_EVENT[target],
      actorUserId: companyUserId,
      entityType: "JobPosting",
      entityId: owned.postingId,
      metadataJson: { from: existing.status, to: target },
    },
  });

  return { ok: true, id: owned.postingId, from: existing.status, to: target };
}

export async function softDeleteJobPosting(
  companyUserId: string,
  jobPostingId: string,
): Promise<DeleteResult> {
  const owned = await loadOwnedPosting(companyUserId, jobPostingId);
  if (!owned.ok) return owned;
  await prisma.jobPosting.update({
    where: { id: owned.postingId },
    data: { deletedAt: new Date() },
  });
  await prisma.activityEvent.create({
    data: {
      type: "JOB_POSTING_SOFT_DELETED",
      actorUserId: companyUserId,
      entityType: "JobPosting",
      entityId: owned.postingId,
    },
  });
  return { ok: true };
}
