/**
 * Profile completeness calculation. Pure logic — no Prisma imports — so it
 * can be reused on the client (read-only display) and the server (the
 * computed `isProfileComplete` boolean stored on the row).
 *
 * The rule:
 *  - Required fields each contribute equally to the percentage.
 *  - Three repeating sections (skills, experiences, projects) each count
 *    as one weight if they have at least one entry.
 *  - `isProfileComplete` flips true once every required item is present.
 *
 * The required-field list is the contract; tweaking it changes
 * completeness for every student, so the unit tests pin the exact set.
 */

export type CompletenessInput = {
  fullName: string | null | undefined;
  headline: string | null | undefined;
  university: string | null | undefined;
  graduationYear: number | null | undefined;
  degree: string | null | undefined;
  major: string | null | undefined;
  location: string | null | undefined;
  workAuthorization: string | null | undefined;
  bio: string | null | undefined;
  resumeStorageKey: string | null | undefined;
  skillCount: number;
  experienceCount: number;
  projectCount: number;
};

export type CompletenessResult = {
  /** 0–100 integer. */
  percent: number;
  /** True iff every required field is present. */
  isComplete: boolean;
  /** Human-readable list of what's still missing. */
  missing: string[];
};

const REQUIRED_FIELDS: Array<{
  key: keyof CompletenessInput;
  label: string;
}> = [
  { key: "fullName", label: "Full name" },
  { key: "headline", label: "Headline" },
  { key: "university", label: "University" },
  { key: "graduationYear", label: "Graduation year" },
  { key: "degree", label: "Degree" },
  { key: "major", label: "Major" },
  { key: "location", label: "Location" },
  { key: "workAuthorization", label: "Work authorization" },
  { key: "bio", label: "Bio" },
  { key: "resumeStorageKey", label: "Resume" },
];

const REPEATING_SECTIONS: Array<{
  key: "skillCount" | "experienceCount" | "projectCount";
  label: string;
}> = [
  { key: "skillCount", label: "At least one skill" },
  { key: "experienceCount", label: "At least one experience" },
  { key: "projectCount", label: "At least one project" },
];

const TOTAL_WEIGHTS = REQUIRED_FIELDS.length + REPEATING_SECTIONS.length;

function isFieldFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return Boolean(value);
}

export function calculateCompleteness(
  input: CompletenessInput,
): CompletenessResult {
  let satisfied = 0;
  const missing: string[] = [];

  for (const { key, label } of REQUIRED_FIELDS) {
    if (isFieldFilled(input[key])) {
      satisfied++;
    } else {
      missing.push(label);
    }
  }

  for (const { key, label } of REPEATING_SECTIONS) {
    const count = input[key];
    if (typeof count === "number" && count > 0) {
      satisfied++;
    } else {
      missing.push(label);
    }
  }

  const percent = Math.round((satisfied / TOTAL_WEIGHTS) * 100);
  return {
    percent,
    isComplete: missing.length === 0,
    missing,
  };
}

/** Exposed for tests so they pin the contract rather than duplicate it. */
export const COMPLETENESS_REQUIRED_FIELDS = REQUIRED_FIELDS.map((f) => f.label);
export const COMPLETENESS_REPEATING_SECTIONS = REPEATING_SECTIONS.map(
  (s) => s.label,
);
