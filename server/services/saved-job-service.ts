import "server-only";

import { prisma } from "@/lib/db/client";
import { publicJobPostingVisibilityWhere } from "@/server/services/visibility-service";

/**
 * Saved-jobs service. A student can bookmark a publicly visible posting
 * to revisit later. The "save" action enforces visibility at write time
 * — non-public postings cannot enter the saved set. Once saved, the
 * row is preserved even if the posting later goes private/closed; the
 * dashboard surfaces the staleness rather than silently dropping it.
 *
 * Mirrors the Result discriminated-union pattern from application-service.
 */

export type SaveFailureReason =
  | "not_student"
  | "job_not_savable";
export type SaveResult =
  | { ok: true; alreadySaved: boolean }
  | { ok: false; reason: SaveFailureReason };

export type UnsaveResult =
  | { ok: true; removed: boolean }
  | { ok: false; reason: "not_student" };

async function getStudentProfileId(userId: string): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}

export async function saveJobPosting(
  studentUserId: string,
  jobPostingId: string,
): Promise<SaveResult> {
  const studentProfileId = await getStudentProfileId(studentUserId);
  if (!studentProfileId) return { ok: false, reason: "not_student" };

  // Visibility gate at write time. The same fragment is used by the
  // public list/detail queries — change there, change everywhere.
  const visible = await prisma.jobPosting.findFirst({
    where: { ...publicJobPostingVisibilityWhere(), id: jobPostingId },
    select: { id: true },
  });
  if (!visible) return { ok: false, reason: "job_not_savable" };

  const existing = await prisma.savedJobPosting.findUnique({
    where: {
      studentProfileId_jobPostingId: {
        studentProfileId,
        jobPostingId,
      },
    },
    select: { id: true },
  });
  if (existing) return { ok: true, alreadySaved: true };

  await prisma.savedJobPosting.create({
    data: { studentProfileId, jobPostingId },
    select: { id: true },
  });
  return { ok: true, alreadySaved: false };
}

export async function unsaveJobPosting(
  studentUserId: string,
  jobPostingId: string,
): Promise<UnsaveResult> {
  const studentProfileId = await getStudentProfileId(studentUserId);
  if (!studentProfileId) return { ok: false, reason: "not_student" };

  const result = await prisma.savedJobPosting.deleteMany({
    where: { studentProfileId, jobPostingId },
  });
  return { ok: true, removed: result.count > 0 };
}

export async function isJobSavedByStudent(
  studentUserId: string,
  jobPostingId: string,
): Promise<boolean> {
  const studentProfileId = await getStudentProfileId(studentUserId);
  if (!studentProfileId) return false;
  const row = await prisma.savedJobPosting.findUnique({
    where: {
      studentProfileId_jobPostingId: {
        studentProfileId,
        jobPostingId,
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export type SavedJobListItem = {
  id: string;
  savedAt: Date;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
    workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
    status: string;
    publishedAt: Date | null;
    applicationDeadline: Date | null;
    /**
     * `isCurrentlyOpen` reflects whether this posting would still pass
     * the public-visibility gate today: PUBLISHED on a non-soft-deleted,
     * APPROVED, non-soft-deleted company. Renderers use it to mark
     * stale rows without filtering them out.
     */
    isCurrentlyOpen: boolean;
    company: {
      companyName: string;
      companySlug: string;
      logoStorageKey: string | null;
    };
  };
};

export async function listSavedJobsForStudent(
  studentUserId: string,
): Promise<SavedJobListItem[]> {
  const studentProfileId = await getStudentProfileId(studentUserId);
  if (!studentProfileId) return [];

  const rows = await prisma.savedJobPosting.findMany({
    where: { studentProfileId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      jobPosting: {
        select: {
          id: true,
          title: true,
          slug: true,
          workplaceType: true,
          status: true,
          publishedAt: true,
          applicationDeadline: true,
          deletedAt: true,
          companyProfile: {
            select: {
              companyName: true,
              slug: true,
              logoStorageKey: true,
              approvalStatus: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });

  return rows.map((r) => {
    const j = r.jobPosting;
    const isCurrentlyOpen =
      j.deletedAt === null &&
      j.status === "PUBLISHED" &&
      j.companyProfile.approvalStatus === "APPROVED" &&
      j.companyProfile.deletedAt === null;
    return {
      id: r.id,
      savedAt: r.createdAt,
      jobPosting: {
        id: j.id,
        title: j.title,
        jobSlug: j.slug,
        workplaceType: j.workplaceType,
        status: j.status,
        publishedAt: j.publishedAt,
        applicationDeadline: j.applicationDeadline,
        isCurrentlyOpen,
        company: {
          companyName: j.companyProfile.companyName,
          companySlug: j.companyProfile.slug,
          logoStorageKey: j.companyProfile.logoStorageKey,
        },
      },
    };
  });
}

export async function countSavedJobsForStudent(
  studentUserId: string,
): Promise<number> {
  const studentProfileId = await getStudentProfileId(studentUserId);
  if (!studentProfileId) return 0;
  return prisma.savedJobPosting.count({ where: { studentProfileId } });
}
