/**
 * Soft-delete query helpers.
 *
 * The schema uses partial unique indexes (`WHERE "deletedAt" IS NULL`) so that
 * unique fields like `User.email` and `CompanyProfile.slug` can be reused
 * after a row is soft-deleted. To keep that contract intact, repository
 * queries must exclude soft-deleted rows from normal reads.
 *
 * These helpers exist so callers don't sprinkle `deletedAt: null` literals
 * across the codebase.
 */

/** Spread into a `where` clause to scope to active (non-soft-deleted) rows. */
export const activeOnly = { deletedAt: null } as const;

/** Spread into a `where` clause to scope to only soft-deleted rows. */
export const softDeletedOnly = { deletedAt: { not: null } } as const;

/**
 * Wrap an existing `where` filter to additionally restrict to active rows.
 * Useful when composing a base filter with the soft-delete convention.
 */
export function withActive<T extends object>(
  where: T,
): T & { deletedAt: null } {
  return { ...where, deletedAt: null };
}
