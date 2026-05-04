import { describe, expect, it } from "vitest";

import { activeOnly, softDeletedOnly, withActive } from "@/lib/db/soft-delete";

describe("soft-delete helpers", () => {
  it("activeOnly matches non-soft-deleted rows", () => {
    expect(activeOnly).toEqual({ deletedAt: null });
  });

  it("softDeletedOnly matches only soft-deleted rows", () => {
    expect(softDeletedOnly).toEqual({ deletedAt: { not: null } });
  });

  it("withActive composes with an existing where clause", () => {
    const base = { role: "STUDENT" as const };
    const composed = withActive(base);
    expect(composed).toEqual({ role: "STUDENT", deletedAt: null });
    // Original is not mutated.
    expect(base).toEqual({ role: "STUDENT" });
  });
});
