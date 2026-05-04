import Link from "next/link";

import {
  AdminFilterBar,
  SelectField,
  TextField,
} from "@/features/admin/admin-filter-bar";
import { AdminPagination } from "@/features/admin/admin-pagination";
import {
  AdminTable,
  type AdminTableColumn,
} from "@/features/admin/admin-table";
import type { ActivityEventType } from "@/lib/db/generated/enums";
import { requireRole } from "@/lib/auth/guards";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityRow,
} from "@/server/repositories/activity-repository";
import {
  listActivityEntityTypesForAdmin,
  listActivityPageForAdmin,
} from "@/server/services/admin-service";
import { listProgramTags } from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin · Activity",
};

const EVENT_TYPES: ActivityEventType[] = [
  "STUDENT_SIGNUP",
  "COMPANY_SIGNUP",
  "STUDENT_PROFILE_COMPLETED",
  "COMPANY_PROFILE_CREATED",
  "COMPANY_APPROVAL_CHANGED",
  "COMPANY_SOFT_DELETED",
  "STUDENT_SOFT_DELETED",
  "JOB_POSTING_CREATED",
  "JOB_POSTING_PUBLISHED",
  "JOB_POSTING_PAUSED",
  "JOB_POSTING_CLOSED",
  "JOB_POSTING_ARCHIVED",
  "JOB_POSTING_SOFT_DELETED",
  "APPLICATION_SUBMITTED",
  "APPLICATION_STATUS_CHANGED",
  "APPLICATION_WITHDRAWN",
  "MESSAGE_THREAD_CREATED",
];
const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPES);

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("ADMIN");
  const raw = await searchParams;

  const q = readParam(raw.q).trim();
  const eventTypeRaw = readParam(raw.eventType).trim();
  const actorUserId = readParam(raw.actorUserId).trim() || undefined;
  const entityType = readParam(raw.entityType).trim() || undefined;
  const entityId = readParam(raw.entityId).trim() || undefined;
  const programTag = readParam(raw.programTag).trim() || null;
  const page = Math.max(
    1,
    Number.parseInt(readParam(raw.page) || "1", 10) || 1,
  );

  const eventType = VALID_EVENT_TYPES.has(eventTypeRaw)
    ? (eventTypeRaw as ActivityEventType)
    : undefined;

  const [pageR, tagsR, etypesR] = await Promise.all([
    listActivityPageForAdmin(
      user.id,
      { q, eventType, actorUserId, entityType, entityId, programTag },
      { page, pageSize: ACTIVITY_PAGE_SIZE },
    ),
    listProgramTags(user.id),
    listActivityEntityTypesForAdmin(user.id),
  ]);
  if (!pageR.ok) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-6 py-12">
        <p className="mx-auto max-w-3xl text-sm text-destructive">
          Admin access required.
        </p>
      </main>
    );
  }
  const data = pageR.data;
  const tags = tagsR.ok ? tagsR.data : [];
  const entityTypes = etypesR.ok ? etypesR.data : [];
  const hasFilters =
    q.length > 0 ||
    Boolean(eventType) ||
    Boolean(actorUserId) ||
    Boolean(entityType) ||
    Boolean(entityId) ||
    Boolean(programTag);

  const columns: AdminTableColumn<ActivityRow>[] = [
    {
      key: "when",
      header: "When",
      width: "narrow",
      cell: (r) => (
        <p className="text-xs text-muted-foreground">
          {r.createdAt.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ),
    },
    {
      key: "type",
      header: "Event",
      cell: (r) => (
        <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
          {r.type}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      cell: (r) => (
        <div>
          <p className="text-xs font-medium">{r.actor?.email ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">
            {r.actor?.role ?? "system"}
            {r.actor?.deletedAt ? " · deleted" : null}
          </p>
        </div>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (r) => (
        <div>
          <p className="text-xs">{r.entityType ?? "—"}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {r.entityId ?? ""}
          </p>
        </div>
      ),
    },
    {
      key: "metadata",
      header: "Metadata",
      width: "wide",
      cell: (r) =>
        r.metadataJson ? (
          <code className="block max-w-md truncate font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(r.metadataJson)}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-6xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Activity audit
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only platform-wide event log. Rows are immutable; there&apos;s no
          UI to edit or delete events.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link className="hover:text-foreground hover:underline" href="/admin">
            ← Dashboard
          </Link>
        </p>
      </header>
      <section className="mx-auto w-full max-w-6xl space-y-3">
        <AdminFilterBar resetHref="/admin/activity" hasAny={hasFilters}>
          <TextField
            name="q"
            label="Search"
            defaultValue={q}
            placeholder="Actor email, entity id, entity type"
          />
          <SelectField
            name="eventType"
            label="Event type"
            defaultValue={eventTypeRaw}
            options={[
              { value: "", label: "Any event" },
              ...EVENT_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
          <SelectField
            name="entityType"
            label="Entity type"
            defaultValue={entityType ?? ""}
            options={[
              { value: "", label: "Any entity" },
              ...entityTypes.map((t) => ({ value: t, label: t })),
            ]}
          />
          <TextField
            name="actorUserId"
            label="Actor user id"
            defaultValue={actorUserId ?? ""}
            placeholder="exact id"
          />
          <TextField
            name="entityId"
            label="Entity id"
            defaultValue={entityId ?? ""}
            placeholder="exact id"
          />
          <SelectField
            name="programTag"
            label="Program tag"
            defaultValue={programTag ?? ""}
            options={[
              { value: "", label: "All programs" },
              ...tags.map((t) => ({ value: t, label: t })),
            ]}
          />
        </AdminFilterBar>
        <AdminTable
          rows={data.rows}
          columns={columns}
          empty="No activity matches those filters."
        />
        <AdminPagination
          basePath="/admin/activity"
          searchParams={raw}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </section>
    </main>
  );
}
