"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  applySchema,
  transitionApplicationStatusSchema,
} from "@/features/applications/schemas";
import {
  submitApplication,
  transitionApplicationStatus,
  type CompanyTransition,
  type SubmitFailureReason,
} from "@/server/services/application-service";

export type ApplyFormState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | { status: "error"; message: string };

const FAILURE_MESSAGES: Record<SubmitFailureReason, string> = {
  not_student: "You must be a student to apply.",
  profile_incomplete:
    "Finish your profile (basics, resume, skill, experience, project) before applying.",
  resume_required:
    "A resume is required to apply. Upload one on your profile and try again.",
  already_applied: "You've already applied to this posting.",
  job_not_open:
    "This posting is no longer accepting applications.",
};

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function applyToJobAction(
  _prev: ApplyFormState,
  formData: FormData,
): Promise<ApplyFormState> {
  const user = await requireRole("STUDENT");

  const parsed = applySchema.safeParse({
    jobPostingId: pickFormString(formData, "jobPostingId"),
    coverLetter: pickFormString(formData, "coverLetter"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your inputs.",
    };
  }

  const result = await submitApplication(user.id, {
    jobPostingId: parsed.data.jobPostingId,
    coverLetter: parsed.data.coverLetter,
  });
  if (!result.ok) {
    return { status: "error", message: FAILURE_MESSAGES[result.reason] };
  }

  revalidatePath("/student/applications");
  revalidatePath("/student", "layout");
  redirect("/student/applications");
}

/**
 * Company-side status transition action. Used by the buttons on
 * /company/applications. Service does the ownership + transition-table
 * checks. Silent reject on malformed input; benign for legit clients.
 */
export async function transitionApplicationStatusAction(
  formData: FormData,
): Promise<void> {
  const user = await requireRole("COMPANY");
  const parsed = transitionApplicationStatusSchema.safeParse({
    applicationId: pickFormString(formData, "applicationId"),
    newStatus: pickFormString(formData, "newStatus"),
  });
  if (!parsed.success) return;
  await transitionApplicationStatus(
    user.id,
    parsed.data.applicationId,
    parsed.data.newStatus as CompanyTransition,
  );
  revalidatePath("/company/applications");
  revalidatePath("/company", "layout");
}

