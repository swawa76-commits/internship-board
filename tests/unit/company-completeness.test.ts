import { describe, expect, it } from "vitest";

import {
  COMPANY_COMPLETENESS_REQUIRED_FIELDS,
  calculateCompanyCompleteness,
} from "@/lib/companies/completeness";

const FULL = {
  companyName: "Acme Robotics",
  slug: "acme-robotics",
  industry: "Robotics",
  companySize: "11-50",
  headquarters: "Pittsburgh, PA",
  shortDescription: "Industrial automation built for small factories.",
  description:
    "We make pick-and-place robotic arms tuned for small factories that have outgrown their CNC operators.",
  contactEmail: "talent@acme.test",
};

describe("calculateCompanyCompleteness", () => {
  it("returns 100 / complete / empty missing for a full profile", () => {
    const r = calculateCompanyCompleteness(FULL);
    expect(r.percent).toBe(100);
    expect(r.isComplete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("returns 0 / incomplete for a totally empty profile", () => {
    const r = calculateCompanyCompleteness({
      companyName: null,
      slug: null,
      industry: null,
      companySize: null,
      headquarters: null,
      shortDescription: null,
      description: null,
      contactEmail: null,
    });
    expect(r.percent).toBe(0);
    expect(r.isComplete).toBe(false);
    expect(r.missing).toEqual(COMPANY_COMPLETENESS_REQUIRED_FIELDS);
  });

  it("treats whitespace-only strings as missing", () => {
    const r = calculateCompanyCompleteness({
      ...FULL,
      shortDescription: "   ",
    });
    expect(r.isComplete).toBe(false);
    expect(r.missing).toContain("Short description");
  });

  it("does not require a logo, website, or program tag", () => {
    // Logo + non-required fields aren't part of the input shape.
    expect(calculateCompanyCompleteness(FULL).isComplete).toBe(true);
  });

  it("rounds the percent to an integer", () => {
    const r = calculateCompanyCompleteness({ ...FULL, headquarters: null });
    expect(Number.isInteger(r.percent)).toBe(true);
    // 7 of 8 required = 87.5 → 88
    expect(r.percent).toBe(88);
  });

  it("pins the contract: 8 required fields", () => {
    expect(COMPANY_COMPLETENESS_REQUIRED_FIELDS).toHaveLength(8);
  });
});
