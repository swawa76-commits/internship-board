/**
 * Company profile completeness calculator. Pure logic — no Prisma, no
 * React — so it's reusable from server components, services, and tests.
 *
 * The required set is the contract. Tweaking it changes whether seeded
 * companies are considered onboarded, so the unit tests pin the exact
 * field list.
 *
 * What's *not* required (intentionally):
 *  - logoStorageKey: nice-to-have. Listings work without a logo.
 *  - websiteUrl, contactEmail social links, programTag: optional.
 *  - approvalStatus: tracked separately. Approval and completeness are
 *    different concepts.
 */

export type CompanyCompletenessInput = {
  companyName: string | null | undefined;
  slug: string | null | undefined;
  industry: string | null | undefined;
  companySize: string | null | undefined;
  headquarters: string | null | undefined;
  shortDescription: string | null | undefined;
  description: string | null | undefined;
  contactEmail: string | null | undefined;
};

export type CompanyCompletenessResult = {
  /** 0–100 integer. */
  percent: number;
  /** True iff every required field is present. */
  isComplete: boolean;
  /** Human-readable list of what's still missing. */
  missing: string[];
};

const REQUIRED_FIELDS: Array<{
  key: keyof CompanyCompletenessInput;
  label: string;
}> = [
  { key: "companyName", label: "Company name" },
  { key: "slug", label: "Slug" },
  { key: "industry", label: "Industry" },
  { key: "companySize", label: "Company size" },
  { key: "headquarters", label: "Headquarters" },
  { key: "shortDescription", label: "Short description" },
  { key: "description", label: "Full description" },
  { key: "contactEmail", label: "Contact email" },
];

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

export function calculateCompanyCompleteness(
  input: CompanyCompletenessInput,
): CompanyCompletenessResult {
  let satisfied = 0;
  const missing: string[] = [];

  for (const { key, label } of REQUIRED_FIELDS) {
    if (isFilled(input[key])) {
      satisfied++;
    } else {
      missing.push(label);
    }
  }

  const percent = Math.round((satisfied / REQUIRED_FIELDS.length) * 100);
  return {
    percent,
    isComplete: missing.length === 0,
    missing,
  };
}

export const COMPANY_COMPLETENESS_REQUIRED_FIELDS = REQUIRED_FIELDS.map(
  (f) => f.label,
);
