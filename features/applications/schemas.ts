import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (v) =>
      typeof v === "string" && v.trim().length === 0
        ? null
        : typeof v === "string"
          ? v.trim()
          : v,
    z.string().max(max).nullable(),
  );

export const applySchema = z.object({
  jobPostingId: z.string().cuid(),
  coverLetter: optionalText(4000),
});

export type ApplyInput = z.infer<typeof applySchema>;

/**
 * The five non-terminal application statuses companies can transition
 * an application through. WITHDRAWN is student-driven (Task 12+) and
 * APPLIED is the inbound state (no transition target).
 */
export const COMPANY_APPLICATION_STATUS_TARGETS = [
  "IN_REVIEW",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
] as const;

export const transitionApplicationStatusSchema = z.object({
  applicationId: z.string().cuid(),
  newStatus: z.enum(COMPANY_APPLICATION_STATUS_TARGETS),
});
