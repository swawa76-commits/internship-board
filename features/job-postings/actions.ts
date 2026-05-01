"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { jobPostingFormSchema } from "@/features/job-postings/schemas";
import {
  createJobPosting,
  softDeleteJobPosting,
  updateJobPosting,
} from "@/server/services/job-posting-service";

/**
 * Action state shape. On error we echo back the user's submitted values
 * + an attempt counter so the form can re-render preserving what they
 * typed (React 19 auto-resets `<form action={fn}>` on completion,
 * including error returns; the counter is used as the `key` on the
 * form so we can deliberately remount with the captured values).
 */
export type JobPostingValues = Record<string, string>;

export type JobPostingFormState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | {
      status: "error";
      message: string;
      values: JobPostingValues;
      attempt: number;
    };

const FIELD_KEYS = [
  "title",
  "department",
  "location",
  "workplaceType",
  "internshipTerm",
  "startDate",
  "duration",
  "compensationType",
  "compensationMin",
  "compensationMax",
  "description",
  "responsibilities",
  "qualifications",
  "applicationDeadline",
  "programTag",
  "status",
] as const;

function captureFormValues(formData: FormData): JobPostingValues {
  const out: JobPostingValues = {};
  for (const k of FIELD_KEYS) {
    const v = formData.get(k);
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}

function nextAttempt(prev: JobPostingFormState): number {
  return prev.status === "error" ? prev.attempt + 1 : 1;
}

const PUBLISH_BLOCKED_MESSAGE =
  "Your company must be approved before this job can be published. You can still save it as a draft.";

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function parseSubmittedFormData(formData: FormData) {
  return jobPostingFormSchema.safeParse({
    title: pickFormString(formData, "title"),
    department: pickFormString(formData, "department"),
    location: pickFormString(formData, "location"),
    workplaceType: pickFormString(formData, "workplaceType"),
    internshipTerm: pickFormString(formData, "internshipTerm"),
    startDate: pickFormString(formData, "startDate"),
    duration: pickFormString(formData, "duration"),
    compensationType: pickFormString(formData, "compensationType"),
    compensationMin: pickFormString(formData, "compensationMin"),
    compensationMax: pickFormString(formData, "compensationMax"),
    description: pickFormString(formData, "description"),
    responsibilities: pickFormString(formData, "responsibilities"),
    qualifications: pickFormString(formData, "qualifications"),
    applicationDeadline: pickFormString(formData, "applicationDeadline"),
    programTag: pickFormString(formData, "programTag"),
    status: pickFormString(formData, "status"),
  });
}

function pathnamesToRevalidate() {
  // The company-side list, the dashboard, and (if the row is now
  // PUBLISHED on an APPROVED company) the public surfaces all read
  // postings. Revalidate broadly — the cost is cheap and the
  // alternative is stale public-list rows.
  revalidatePath("/company", "layout");
  revalidatePath("/jobs");
  revalidatePath("/companies", "layout");
}

function errorState(
  prev: JobPostingFormState,
  message: string,
  formData: FormData,
): JobPostingFormState {
  return {
    status: "error",
    message,
    values: captureFormValues(formData),
    attempt: nextAttempt(prev),
  };
}

export async function createJobPostingAction(
  prev: JobPostingFormState,
  formData: FormData,
): Promise<JobPostingFormState> {
  const user = await requireRole("COMPANY");

  const parsed = parseSubmittedFormData(formData);
  if (!parsed.success) {
    return errorState(
      prev,
      parsed.error.issues[0]?.message ??
        "Please check the highlighted fields.",
      formData,
    );
  }

  const result = await createJobPosting(user.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "publish_blocked") {
      return errorState(prev, PUBLISH_BLOCKED_MESSAGE, formData);
    }
    if (result.reason === "not_onboarded") {
      return errorState(
        prev,
        "Finish your company profile before posting jobs.",
        formData,
      );
    }
    return errorState(prev, "Could not create the posting.", formData);
  }

  pathnamesToRevalidate();
  redirect("/company/jobs");
}

const updateBindSchema = z.object({ id: z.string().cuid() });

export async function updateJobPostingAction(
  jobPostingId: string,
  prev: JobPostingFormState,
  formData: FormData,
): Promise<JobPostingFormState> {
  const user = await requireRole("COMPANY");
  const idOk = updateBindSchema.safeParse({ id: jobPostingId });
  if (!idOk.success) {
    return errorState(prev, "Invalid job posting.", formData);
  }

  const parsed = parseSubmittedFormData(formData);
  if (!parsed.success) {
    return errorState(
      prev,
      parsed.error.issues[0]?.message ??
        "Please check the highlighted fields.",
      formData,
    );
  }

  const result = await updateJobPosting(
    user.id,
    idOk.data.id,
    parsed.data,
  );
  if (!result.ok) {
    if (result.reason === "publish_blocked") {
      return errorState(prev, PUBLISH_BLOCKED_MESSAGE, formData);
    }
    if (result.reason === "not_found") {
      return errorState(prev, "That posting no longer exists.", formData);
    }
    return errorState(
      prev,
      "You can only edit your own postings.",
      formData,
    );
  }

  pathnamesToRevalidate();
  redirect("/company/jobs");
}

export async function softDeleteJobPostingAction(
  formData: FormData,
): Promise<void> {
  const user = await requireRole("COMPANY");
  const id = pickFormString(formData, "id");
  if (!z.string().cuid().safeParse(id).success) return;
  await softDeleteJobPosting(user.id, id);
  pathnamesToRevalidate();
}
