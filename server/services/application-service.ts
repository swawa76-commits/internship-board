import "server-only";

import { prisma } from "@/lib/db/client";
import type {
  ApplicationStatus,
  CompanyApprovalStatus,
} from "@/lib/db/generated/enums";
import { canCompanyPublishJobsByStatus } from "@/server/services/visibility-service";

/**
 * Application service. Submission has four pre-flight checks (CLAUDE.md
 * + Task 11 spec). The student → application → company-side
 * relationships all flow through this file; nothing else writes to
 * `Application`.
 *
 * Snapshot pattern: when an application is created, we capture the
 * student's CURRENT `resumeStorageKey` onto `resumeStorageKeySnapshot`.
 * Subsequent profile changes don't bleed into the application — the
 * company always sees the version that was applied with.
 */

export type SubmitFailureReason =
  | "not_student"
  | "profile_incomplete"
  | "resume_required"
  | "already_applied"
  | "job_not_open";

export type SubmitResult =
  | { ok: true; applicationId: string }
  | { ok: false; reason: SubmitFailureReason };

/**
 * "Active application" = the student is still in flight for this role.
 * Used by the applicant-visibility bypass: a student with an active
 * application can still read a now-private job posting detail page.
 *
 * REJECTED and WITHDRAWN are NOT active — those students no longer
 * need ongoing access to the posting.
 */
export const ACTIVE_APPLICATION_STATUSES = [
  "APPLIED",
  "IN_REVIEW",
  "INTERVIEWING",
  "OFFER",
] as const;
export type ActiveApplicationStatus =
  (typeof ACTIVE_APPLICATION_STATUSES)[number];

/**
 * True iff the given user is a student who currently holds an active
 * application for the given posting. Used by the public detail-page
 * visibility bypass and by the student-applications list to decide
 * whether to render the row's title as a clickable link.
 */
export async function studentHasActiveApplication(
  userId: string,
  jobPostingId: string,
): Promise<boolean> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return false;
  const application = await prisma.application.findUnique({
    where: {
      jobPostingId_studentProfileId: {
        jobPostingId,
        studentProfileId: profile.id,
      },
    },
    select: { status: true },
  });
  if (!application) return false;
  return (ACTIVE_APPLICATION_STATUSES as ReadonlyArray<string>).includes(
    application.status,
  );
}

export type SubmitInput = {
  jobPostingId: string;
  coverLetter: string | null;
};

export async function submitApplication(
  studentUserId: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  // 1. The actor is a fully-onboarded STUDENT.
  const student = await prisma.user.findFirst({
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: {
      id: true,
      studentProfile: {
        select: {
          id: true,
          isProfileComplete: true,
          resumeStorageKey: true,
        },
      },
    },
  });
  if (!student) return { ok: false, reason: "not_student" };
  if (!student.studentProfile || !student.studentProfile.isProfileComplete) {
    return { ok: false, reason: "profile_incomplete" };
  }
  // 1b. A resume is required to apply. Even if isProfileComplete is
  // somehow true without one (test fixtures, future migration weirdness),
  // the application must carry a snapshot of bytes the company can read.
  if (!student.studentProfile.resumeStorageKey) {
    return { ok: false, reason: "resume_required" };
  }

  // 3 + 4. The job is currently PUBLISHED on a currently-APPROVED
  //         non-soft-deleted company. We do this in a single query so
  //         the visibility gate is atomic, not a TOCTOU race.
  const job = await prisma.jobPosting.findFirst({
    where: {
      id: input.jobPostingId,
      deletedAt: null,
      status: "PUBLISHED",
      companyProfile: {
        deletedAt: null,
        approvalStatus: "APPROVED",
      },
    },
    select: {
      id: true,
      companyProfile: { select: { approvalStatus: true } },
    },
  });
  if (!job) return { ok: false, reason: "job_not_open" };

  // Belt-and-braces — the visibility predicate above already covers
  // this, but if the rule ever evolves, this assertion fails loudly.
  if (
    !canCompanyPublishJobsByStatus(
      job.companyProfile.approvalStatus as CompanyApprovalStatus,
    )
  ) {
    return { ok: false, reason: "job_not_open" };
  }

  // 2. No prior application from this student to this posting.
  const existing = await prisma.application.findUnique({
    where: {
      jobPostingId_studentProfileId: {
        jobPostingId: job.id,
        studentProfileId: student.studentProfile.id,
      },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_applied" };

  // Snapshot the resume key inline with the create. The snapshot is
  // immutable for the application's lifetime — Task 12+ student-side
  // profile edits do not propagate.
  const snapshotKey = student.studentProfile.resumeStorageKey;

  const [application] = await prisma.$transaction([
    prisma.application.create({
      data: {
        jobPostingId: job.id,
        studentProfileId: student.studentProfile.id,
        coverLetter: input.coverLetter,
        resumeStorageKeySnapshot: snapshotKey,
        status: "APPLIED",
      },
      select: { id: true },
    }),
    prisma.activityEvent.create({
      data: {
        type: "APPLICATION_SUBMITTED",
        actorUserId: student.id,
        entityType: "Application",
        entityId: input.jobPostingId,
        metadataJson: {
          jobPostingId: job.id,
          studentProfileId: student.studentProfile.id,
        },
      },
    }),
  ]);

  return { ok: true, applicationId: application.id };
}

// ---------- Reads ----------

export type StudentApplicationListItem = {
  id: string;
  status: ApplicationStatus;
  appliedAt: Date;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
    workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
    status: string;
    company: {
      companyName: string;
      companySlug: string;
    };
  };
};

export async function listApplicationsForStudent(
  studentUserId: string,
): Promise<StudentApplicationListItem[]> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!profile) return [];

  const rows = await prisma.application.findMany({
    where: { studentProfileId: profile.id },
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      jobPosting: {
        select: {
          id: true,
          title: true,
          slug: true,
          workplaceType: true,
          status: true,
          companyProfile: { select: { companyName: true, slug: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    appliedAt: r.appliedAt,
    jobPosting: {
      id: r.jobPosting.id,
      title: r.jobPosting.title,
      jobSlug: r.jobPosting.slug,
      workplaceType: r.jobPosting.workplaceType,
      status: r.jobPosting.status,
      company: {
        companyName: r.jobPosting.companyProfile.companyName,
        companySlug: r.jobPosting.companyProfile.slug,
      },
    },
  }));
}

export type CompanyApplicantRow = {
  id: string;
  status: ApplicationStatus;
  appliedAt: Date;
  coverLetter: string | null;
  resumeStorageKeySnapshot: string | null;
  jobPosting: {
    id: string;
    title: string;
    jobSlug: string;
  };
  studentProfile: {
    id: string;
    fullName: string;
    headline: string | null;
    university: string | null;
    major: string | null;
    graduationYear: number | null;
    location: string | null;
  };
};

export async function listApplicationsForCompany(
  companyUserId: string,
): Promise<CompanyApplicantRow[]> {
  const company = await prisma.companyProfile.findFirst({
    where: { userId: companyUserId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return [];

  const rows = await prisma.application.findMany({
    // Exclude rows whose parent records were soft-deleted by an
    // admin: the company can't usefully act on them and the student's
    // resume snapshot link would dangle. Historical view still lives
    // on /admin/applications which deliberately shows everything.
    where: {
      jobPosting: { companyProfileId: company.id, deletedAt: null },
      studentProfile: { user: { deletedAt: null } },
    },
    orderBy: [{ status: "asc" }, { appliedAt: "desc" }],
    select: {
      id: true,
      status: true,
      appliedAt: true,
      coverLetter: true,
      resumeStorageKeySnapshot: true,
      jobPosting: {
        select: { id: true, title: true, slug: true },
      },
      studentProfile: {
        select: {
          id: true,
          fullName: true,
          headline: true,
          university: true,
          major: true,
          graduationYear: true,
          location: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    appliedAt: r.appliedAt,
    coverLetter: r.coverLetter,
    resumeStorageKeySnapshot: r.resumeStorageKeySnapshot,
    jobPosting: {
      id: r.jobPosting.id,
      title: r.jobPosting.title,
      jobSlug: r.jobPosting.slug,
    },
    studentProfile: r.studentProfile,
  }));
}

// ---------- Status transitions ----------

export type CompanyTransition = "IN_REVIEW" | "INTERVIEWING" | "OFFER" | "REJECTED";

export type TransitionResult =
  | {
      ok: true;
      applicationId: string;
      from: ApplicationStatus;
      to: CompanyTransition;
    }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid_transition" };

/**
 * Allowed forward (and limited reverse) transitions a company can make.
 * The product rule: the funnel is mostly forward, but a company can
 * pull a candidate from REJECTED back to IN_REVIEW or INTERVIEWING if
 * they reconsider, which has happened in real recruiting flows.
 *
 * WITHDRAWN is student-driven (Task 12) and not a target here.
 */
const ALLOWED: Record<ApplicationStatus, ReadonlyArray<CompanyTransition>> = {
  APPLIED: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["INTERVIEWING", "REJECTED"],
  INTERVIEWING: ["OFFER", "REJECTED"],
  OFFER: ["REJECTED"],
  REJECTED: ["IN_REVIEW", "INTERVIEWING"],
  WITHDRAWN: [],
};

export async function transitionApplicationStatus(
  companyUserId: string,
  applicationId: string,
  target: CompanyTransition,
): Promise<TransitionResult> {
  const company = await prisma.companyProfile.findFirst({
    where: { userId: companyUserId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return { ok: false, reason: "forbidden" };

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      jobPosting: { companyProfileId: company.id },
    },
    select: { id: true, status: true, studentProfile: { select: { userId: true } } },
  });
  if (!application) return { ok: false, reason: "not_found" };

  const allowed = ALLOWED[application.status] ?? [];
  if (!allowed.includes(target)) {
    return { ok: false, reason: "invalid_transition" };
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { id: application.id },
      data: { status: target },
    }),
    prisma.activityEvent.create({
      data: {
        type: "APPLICATION_STATUS_CHANGED",
        actorUserId: companyUserId,
        entityType: "Application",
        entityId: application.id,
        metadataJson: { from: application.status, to: target },
      },
    }),
  ]);

  return {
    ok: true,
    applicationId: application.id,
    from: application.status,
    to: target,
  };
}

// ---------- Student-driven withdrawal ----------

export type WithdrawResult =
  | { ok: true; applicationId: string; from: ApplicationStatus }
  | { ok: false; reason: "not_found" | "forbidden" | "not_active" };

/**
 * Student-driven WITHDRAWN transition. The student can pull themselves
 * from any active status (APPLIED/IN_REVIEW/INTERVIEWING/OFFER). They
 * cannot un-withdraw — the action is intentionally one-way; reapplying
 * is blocked by the unique (jobPostingId, studentProfileId) constraint
 * (Clarification 4: one application ever per student per posting).
 *
 * REJECTED is left alone — that's a closed-funnel terminal state owned
 * by the company side.
 */
export async function withdrawApplicationByStudent(
  studentUserId: string,
  applicationId: string,
): Promise<WithdrawResult> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!profile) return { ok: false, reason: "forbidden" };

  const application = await prisma.application.findFirst({
    where: { id: applicationId, studentProfileId: profile.id },
    select: { id: true, status: true },
  });
  if (!application) return { ok: false, reason: "not_found" };

  if (
    !(ACTIVE_APPLICATION_STATUSES as ReadonlyArray<string>).includes(
      application.status,
    )
  ) {
    return { ok: false, reason: "not_active" };
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { id: application.id },
      data: { status: "WITHDRAWN" },
    }),
    // Dedicated event so the admin feed and any future notification
    // pipeline can distinguish student-driven withdrawal from
    // company-driven status changes.
    prisma.activityEvent.create({
      data: {
        type: "APPLICATION_WITHDRAWN",
        actorUserId: studentUserId,
        entityType: "Application",
        entityId: application.id,
        metadataJson: { from: application.status },
      },
    }),
  ]);

  return { ok: true, applicationId: application.id, from: application.status };
}

/**
 * Permission check used by the snapshot resume read route. A company
 * can read the snapshot iff the application belongs to one of their
 * postings. This is intentionally separate from
 * `canStudentReadResume` (Task 6) — different policy, different route.
 */
export async function canCompanyReadApplicationSnapshot(
  companyUserId: string,
  applicationId: string,
): Promise<{ ok: boolean; storageKey: string | null }> {
  const company = await prisma.companyProfile.findFirst({
    where: { userId: companyUserId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return { ok: false, storageKey: null };
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      jobPosting: { companyProfileId: company.id },
    },
    select: { resumeStorageKeySnapshot: true },
  });
  if (!application) return { ok: false, storageKey: null };
  return {
    ok: true,
    storageKey: application.resumeStorageKeySnapshot,
  };
}
