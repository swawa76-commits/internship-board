import { describe, expect, it } from "vitest";

import {
  COMPLETENESS_REPEATING_SECTIONS,
  COMPLETENESS_REQUIRED_FIELDS,
  calculateCompleteness,
} from "@/lib/students/completeness";

const FULLY_COMPLETE = {
  fullName: "Test Student",
  headline: "Aspiring backend engineer",
  university: "State University",
  graduationYear: 2027,
  degree: "B.S.",
  major: "Computer Science",
  location: "Remote",
  workAuthorization: "US citizen",
  bio: "I love building reliable systems.",
  resumeStorageKey: "resumes/abc.pdf",
  skillCount: 3,
  experienceCount: 1,
  projectCount: 1,
};

describe("calculateCompleteness", () => {
  it("returns 100 / complete / empty missing for a fully populated profile", () => {
    const r = calculateCompleteness(FULLY_COMPLETE);
    expect(r.percent).toBe(100);
    expect(r.isComplete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("returns 0 / incomplete for a totally empty profile", () => {
    const r = calculateCompleteness({
      fullName: null,
      headline: null,
      university: null,
      graduationYear: null,
      degree: null,
      major: null,
      location: null,
      workAuthorization: null,
      bio: null,
      resumeStorageKey: null,
      skillCount: 0,
      experienceCount: 0,
      projectCount: 0,
    });
    expect(r.percent).toBe(0);
    expect(r.isComplete).toBe(false);
    // Every required field + every repeating section should appear.
    expect(r.missing).toEqual([
      ...COMPLETENESS_REQUIRED_FIELDS,
      ...COMPLETENESS_REPEATING_SECTIONS,
    ]);
  });

  it("treats whitespace-only strings as missing", () => {
    const r = calculateCompleteness({ ...FULLY_COMPLETE, bio: "   " });
    expect(r.isComplete).toBe(false);
    expect(r.missing).toContain("Bio");
  });

  it("treats graduationYear null as missing but a real year as filled", () => {
    expect(
      calculateCompleteness({ ...FULLY_COMPLETE, graduationYear: null })
        .isComplete,
    ).toBe(false);
    expect(
      calculateCompleteness({ ...FULLY_COMPLETE, graduationYear: 2030 })
        .isComplete,
    ).toBe(true);
  });

  it("requires at least one item per repeating section", () => {
    expect(
      calculateCompleteness({ ...FULLY_COMPLETE, skillCount: 0 }).isComplete,
    ).toBe(false);
    expect(
      calculateCompleteness({ ...FULLY_COMPLETE, projectCount: 0 }).isComplete,
    ).toBe(false);
    expect(
      calculateCompleteness({ ...FULLY_COMPLETE, experienceCount: 0 })
        .isComplete,
    ).toBe(false);
  });

  it("rounds the percent to an integer", () => {
    // Drop one of 13 weighted items; expect a non-integer ratio rounded.
    const r = calculateCompleteness({ ...FULLY_COMPLETE, headline: null });
    expect(Number.isInteger(r.percent)).toBe(true);
    expect(r.percent).toBe(92); // 12 of 13 = 92.30 → 92
  });

  it("pins the contract: 10 required fields and 3 repeating sections", () => {
    expect(COMPLETENESS_REQUIRED_FIELDS).toHaveLength(10);
    expect(COMPLETENESS_REPEATING_SECTIONS).toHaveLength(3);
  });
});
