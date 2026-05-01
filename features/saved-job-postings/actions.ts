"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { toggleSavedJobSchema } from "@/features/saved-job-postings/schemas";
import {
  saveJobPosting,
  unsaveJobPosting,
} from "@/server/services/saved-job-service";

function pickFormString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Toggle save/unsave for a posting. Used by the JobCard and detail-page
 * Save button. Silent reject on malformed input — benign for legit
 * clients. The save path itself enforces the visibility gate inside the
 * service.
 */
export async function toggleSavedJobAction(formData: FormData): Promise<void> {
  const user = await requireRole("STUDENT");
  const parsed = toggleSavedJobSchema.safeParse({
    jobPostingId: pickFormString(formData, "jobPostingId"),
    intent: pickFormString(formData, "intent"),
  });
  if (!parsed.success) return;

  if (parsed.data.intent === "save") {
    await saveJobPosting(user.id, parsed.data.jobPostingId);
  } else {
    await unsaveJobPosting(user.id, parsed.data.jobPostingId);
  }

  // Revalidate every surface the toggle could affect.
  revalidatePath("/jobs");
  revalidatePath("/student/saved-job-postings");
  revalidatePath("/student/dashboard");
  revalidatePath("/student", "layout");
}
