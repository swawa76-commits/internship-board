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

const currentYear = new Date().getFullYear();

export const profileBasicsSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  headline: optionalText(160),
  university: optionalText(120),
  graduationYear: z.preprocess(
    (v) => {
      if (v === "" || v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    },
    z
      .number()
      .int()
      .min(currentYear - 5, "That graduation year looks too far in the past.")
      .max(currentYear + 10, "That graduation year looks too far in the future.")
      .nullable(),
  ),
  degree: optionalText(80),
  major: optionalText(120),
  location: optionalText(120),
  workAuthorization: optionalText(120),
  bio: optionalText(2000),
  portfolioUrl: optionalUrl(),
  linkedinUrl: optionalUrl(),
  githubUrl: optionalUrl(),
  programTag: optionalText(60),
});

export type ProfileBasicsInput = z.infer<typeof profileBasicsSchema>;

export const skillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required.").max(60),
});
export type SkillInput = z.infer<typeof skillSchema>;

export const experienceSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120),
  organization: z.string().trim().min(1, "Organization is required.").max(160),
  startDate: z.preprocess(
    (v) => (typeof v === "string" && v.length === 0 ? null : v),
    z.coerce.date().nullable(),
  ),
  endDate: z.preprocess(
    (v) => (typeof v === "string" && v.length === 0 ? null : v),
    z.coerce.date().nullable(),
  ),
  description: optionalText(1500),
});
export type ExperienceInput = z.infer<typeof experienceSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required.").max(120),
  url: optionalUrl(),
  description: optionalText(1500),
});
export type ProjectInput = z.infer<typeof projectSchema>;
