import "server-only";

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/lib/db/generated/client";
import type { ActivityEventType } from "@/lib/db/generated/enums";

/**
 * ActivityEvent data-access layer. Used only by admin-service —
 * the audit log is a read-only admin surface; no actor-facing UI
 * paginates events directly.
 *
 * Rules pinned by Task 17:
 *   - Pagination is database-level (take/skip + count).
 *   - The log is immutable — we never delete or update rows.
 *   - The keyword search hits `metadataJson` text representation.
 *     Postgres can index the cast we use (`metadataJson::text`) but
 *     V1 traffic doesn't justify it; the planner does sequential
 *     scans within the typical 20-row page just fine.
 */

export const ACTIVITY_PAGE_SIZE = 25;

export type ActivityFilters = {
  q?: string;
  eventType?: ActivityEventType;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Restrict to events whose actor is on this programTag. */
  programTag?: string | null;
};

export type ActivityRow = {
  id: string;
  type: ActivityEventType;
  actorUserId: string | null;
  actor: {
    email: string;
    role: string;
    deletedAt: Date | null;
  } | null;
  entityType: string | null;
  entityId: string | null;
  metadataJson: unknown;
  createdAt: Date;
};

export type Page = { page: number; pageSize: number };
export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

function clamp(p: Page): Page {
  return {
    page: Math.max(1, p.page | 0),
    pageSize: Math.max(1, Math.min(100, p.pageSize | 0)),
  };
}

function offset({ page, pageSize }: Page): number {
  return Math.max(0, (page - 1) * pageSize);
}

async function buildWhere(
  filters: ActivityFilters,
): Promise<Prisma.ActivityEventWhereInput> {
  const where: Prisma.ActivityEventWhereInput = {};
  const ands: Prisma.ActivityEventWhereInput[] = [];

  if (filters.eventType) where.type = filters.eventType;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;

  if (filters.programTag) {
    // Match either the actor OR the affected entity on this tag.
    // Affected-entity match resolves the entity id by entityType
    // against the relevant table — covers the common case from the
    // brief: "admin modifies a student in Spring2026; filter by
    // Spring2026 should surface that event" even though the actor
    // (admin) has no programTag.
    const affectedStudent: Prisma.ActivityEventWhereInput = {
      entityType: "StudentProfile",
      entityId: {
        in: (
          await prisma.studentProfile.findMany({
            where: { programTag: filters.programTag },
            select: { id: true },
          })
        ).map((r) => r.id),
      },
    };
    const affectedStudentByUser: Prisma.ActivityEventWhereInput = {
      entityType: "User",
      entityId: {
        in: (
          await prisma.studentProfile.findMany({
            where: { programTag: filters.programTag },
            select: { userId: true },
          })
        ).map((r) => r.userId),
      },
    };
    const affectedCompany: Prisma.ActivityEventWhereInput = {
      entityType: "CompanyProfile",
      entityId: {
        in: (
          await prisma.companyProfile.findMany({
            where: { programTag: filters.programTag },
            select: { id: true },
          })
        ).map((r) => r.id),
      },
    };
    const affectedJobPosting: Prisma.ActivityEventWhereInput = {
      entityType: "JobPosting",
      entityId: {
        in: (
          await prisma.jobPosting.findMany({
            where: { programTag: filters.programTag },
            select: { id: true },
          })
        ).map((r) => r.id),
      },
    };
    const actorOnTag: Prisma.ActivityEventWhereInput = {
      actorUser: {
        OR: [
          { studentProfile: { programTag: filters.programTag } },
          { companyProfile: { programTag: filters.programTag } },
        ],
      },
    };
    ands.push({
      OR: [
        actorOnTag,
        affectedStudent,
        affectedStudentByUser,
        affectedCompany,
        affectedJobPosting,
      ],
    });
  }

  const q = filters.q?.trim();
  if (q) {
    // Free-text search across actor email, entity columns, AND the
    // metadataJson blob. Prisma's JSON filters only walk specific
    // paths, so for blob-wide search we resolve matching ids in a
    // small companion raw query (`metadataJson::text ILIKE %q%`)
    // and OR them in. Postgres-only — fine for V1.
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const metadataMatches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ActivityEvent"
      WHERE "metadataJson"::text ILIKE ${like}
    `;
    ands.push({
      OR: [
        {
          actorUser: { email: { contains: q, mode: "insensitive" } },
        },
        { entityId: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { id: { in: metadataMatches.map((m) => m.id) } },
      ],
    });
  }

  if (ands.length > 0) where.AND = ands;
  return where;
}

export async function pageActivityForAdmin(
  filters: ActivityFilters,
  pageInput: Page,
): Promise<Paged<ActivityRow>> {
  const p = clamp(pageInput);
  const where = await buildWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset(p),
      take: p.pageSize,
      select: {
        id: true,
        type: true,
        actorUserId: true,
        entityType: true,
        entityId: true,
        metadataJson: true,
        createdAt: true,
        actorUser: {
          select: { email: true, role: true, deletedAt: true },
        },
      },
    }),
    prisma.activityEvent.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorUserId: r.actorUserId,
      actor: r.actorUser
        ? {
            email: r.actorUser.email,
            role: r.actorUser.role,
            deletedAt: r.actorUser.deletedAt,
          }
        : null,
      entityType: r.entityType,
      entityId: r.entityId,
      metadataJson: r.metadataJson,
      createdAt: r.createdAt,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

/**
 * Distinct entityType values currently in use across the activity
 * table. Feeds the page's filter dropdown — small set, cheap query.
 */
export async function listActivityEntityTypes(): Promise<string[]> {
  const rows = await prisma.activityEvent.findMany({
    where: { entityType: { not: null } },
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows
    .map((r) => r.entityType)
    .filter((v): v is string => Boolean(v));
}
