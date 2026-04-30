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

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (v === "" || v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    },
    z.number().int().min(min).max(max).nullable(),
  );

const optionalDate = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.length === 0 ? null : v),
    z.coerce.date().nullable(),
  );

const WORKPLACE_TYPES = ["REMOTE", "HYBRID", "ONSITE"] as const;
const INTERNSHIP_TERMS = [
  "SUMMER",
  "FALL",
  "WINTER",
  "SPRING",
  "YEAR_ROUND",
] as const;
const COMPENSATION_TYPES = ["PAID", "UNPAID", "STIPEND"] as const;

/**
 * The V1 UI exposes only DRAFT and PUBLISHED transitions (per the Task 9
 * directive). The schema keeps PAUSED / CLOSED / ARCHIVED for the
 * eventual management surface, but the Zod schema here is the contract
 * companies can drive from the form — limiting the surface limits the
 * blast radius of mistakes.
 */
const JOB_POSTING_USER_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type JobPostingUserStatus = (typeof JOB_POSTING_USER_STATUSES)[number];

export const jobPostingFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(160),
    department: optionalText(120),
    location: optionalText(160),
    workplaceType: z.enum(WORKPLACE_TYPES),
    internshipTerm: z.preprocess(
      (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
      z.enum(INTERNSHIP_TERMS).nullable(),
    ),
    startDate: optionalDate(),
    duration: optionalText(80),
    compensationType: z.preprocess(
      (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
      z.enum(COMPENSATION_TYPES).nullable(),
    ),
    compensationMin: optionalInt(0, 1_000_000),
    compensationMax: optionalInt(0, 1_000_000),
    description: z
      .string()
      .trim()
      .min(1, "Description is required.")
      .max(8000),
    responsibilities: optionalText(4000),
    qualifications: optionalText(4000),
    applicationDeadline: optionalDate(),
    programTag: optionalText(60),
    status: z.enum(JOB_POSTING_USER_STATUSES),
  })
  .superRefine((data, ctx) => {
    if (
      data.compensationMin != null &&
      data.compensationMax != null &&
      data.compensationMax < data.compensationMin
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compensationMax"],
        message: "Max compensation cannot be less than min.",
      });
    }
  });

export type JobPostingFormInput = z.infer<typeof jobPostingFormSchema>;
