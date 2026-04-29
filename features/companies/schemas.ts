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

const optionalUrl = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
    z.string().url().max(500).nullable(),
  );

const optionalEmail = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
    z.string().email().max(255).nullable(),
  );

/**
 * Schema for the main "company basics" form.
 *
 * `slug` is intentionally NOT in this input shape — the service derives
 * it from `companyName` on first save (so a company can't shadow another
 * company's slug or accidentally set a malformed one). Renaming a slug
 * mid-life is an admin concern, not a self-service one in V1.
 *
 * `approvalStatus` is also absent — that lives behind the admin flow.
 */
export const companyBasicsSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required.").max(160),
  industry: optionalText(120),
  companySize: optionalText(60),
  headquarters: optionalText(160),
  shortDescription: optionalText(280),
  description: optionalText(4000),
  contactEmail: optionalEmail(),
  websiteUrl: optionalUrl(),
  programTag: optionalText(60),
});

export type CompanyBasicsInput = z.infer<typeof companyBasicsSchema>;
