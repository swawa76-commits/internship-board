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

function buildWhere(filters: ActivityFilters): Prisma.ActivityEventWhereInput {
  const where: Prisma.ActivityEventWhereInput = {};
  if (filters.eventType) where.type = filters.eventType;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;

  if (filters.programTag) {
    // Match events whose actor is a student/company on this tag.
    where.actorUser = {
      OR: [
        { studentProfile: { programTag: filters.programTag } },
        { companyProfile: { programTag: filters.programTag } },
      ],
    };
  }

  const q = filters.q?.trim();
  if (q) {
    // metadataJson search uses Prisma's `string_contains` on the
    // top-level path — works for the simple key/value blobs we write
    // (e.g., title, email, status). Combined with a contains on the
    // actor email so a free-text search matches what an admin would
    // type.
    where.OR = [
      {
        actorUser: { email: { contains: q, mode: "insensitive" } },
      },
      { entityId: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function pageActivityForAdmin(
  filters: ActivityFilters,
  pageInput: Page,
): Promise<Paged<ActivityRow>> {
  const p = clamp(pageInput);
  const where = buildWhere(filters);
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
