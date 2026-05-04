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
import { ConfirmFormButton } from "@/features/admin/confirm-form-button";
import { softDeleteJobPostingAdminAction } from "@/features/admin/actions";
import type { JobPostingStatus } from "@/lib/db/generated/enums";
import { requireRole } from "@/lib/auth/guards";
import {
  ADMIN_PAGE_SIZE,
  type AdminJobRow,
} from "@/server/repositories/admin-repository";
import {
  listFilterCompaniesForAdmin,
  listJobPostingsPageForAdmin,
} from "@/server/services/admin-service";
import { listProgramTags } from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin · Job postings",
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "PAUSED", label: "Paused" },
  { value: "CLOSED", label: "Closed" },
  { value: "ARCHIVED", label: "Archived" },
];
const VALID_STATUSES = new Set([
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "CLOSED",
  "ARCHIVED",
]);

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("ADMIN");
  const raw = await searchParams;

  const q = readParam(raw.q).trim();
  const statusRaw = readParam(raw.status).trim();
  const programTag = readParam(raw.programTag).trim() || null;
  const companyProfileId = readParam(raw.companyProfileId).trim() || undefined;
  const includeDeleted = readParam(raw.includeDeleted) === "1";
  const page = Math.max(
    1,
    Number.parseInt(readParam(raw.page) || "1", 10) || 1,
  );

  const status = VALID_STATUSES.has(statusRaw)
    ? (statusRaw as JobPostingStatus)
    : undefined;

  const [pageR, tagsR, coR] = await Promise.all([
    listJobPostingsPageForAdmin(
      user.id,
      { q, status, companyProfileId, programTag, includeDeleted },
      { page, pageSize: ADMIN_PAGE_SIZE },
    ),
    listProgramTags(user.id),
    listFilterCompaniesForAdmin(user.id),
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
  const tags = tagsR.ok ? tagsR.data : [];
  const companies = coR.ok ? coR.data : [];
  const data = pageR.data;
  const hasFilters =
    q.length > 0 ||
    Boolean(status) ||
    Boolean(programTag) ||
    Boolean(companyProfileId) ||
    includeDeleted;

  const columns: AdminTableColumn<AdminJobRow>[] = [
    {
      key: "posting",
      header: "Posting",
      width: "wide",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">
            {r.company.companyName} · /{r.jobSlug}
            {r.programTag ? <> · tag {r.programTag}</> : null}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
            {r.status}
          </span>
          {r.company.approvalStatus !== "APPROVED" ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Co {r.company.approvalStatus}
            </span>
          ) : null}
          {r.deletedAt ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
              DELETED
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "applicants",
      header: "Applicants",
      cell: (r) => <p className="font-mono text-xs">{r.applicationCount}</p>,
    },
    {
      key: "published",
      header: "Published",
      cell: (r) => (
        <p className="text-xs text-muted-foreground">
          {r.publishedAt
            ? r.publishedAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—"}
        </p>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        !r.deletedAt ? (
          <form action={softDeleteJobPostingAdminAction}>
            <input type="hidden" name="id" value={r.id} />
            <ConfirmFormButton
              label="Delete"
              confirmMessage={`Soft-delete posting "${r.title}"? It will hide from the public board.`}
            />
          </form>
        ) : null,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-6xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Job postings</h1>
        <p className="text-sm text-muted-foreground">
          Cross-company view of every posting. Includes drafts, paused, closed,
          archived, and postings on pending or suspended companies — admin
          visibility deliberately bypasses the public visibility rules.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link className="hover:text-foreground hover:underline" href="/admin">
            ← Dashboard
          </Link>
        </p>
      </header>
      <section className="mx-auto w-full max-w-6xl space-y-3">
        <AdminFilterBar resetHref="/admin/jobs" hasAny={hasFilters}>
          <TextField
            name="q"
            label="Search"
            defaultValue={q}
            placeholder="Title, description, or company"
          />
          <SelectField
            name="status"
            label="Status"
            defaultValue={statusRaw}
            options={STATUS_OPTIONS}
          />
          <SelectField
            name="companyProfileId"
            label="Company"
            defaultValue={companyProfileId ?? ""}
            options={[
              { value: "", label: "Any company" },
              ...companies.map((c) => ({ value: c.id, label: c.companyName })),
            ]}
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
          <SelectField
            name="includeDeleted"
            label="Soft-deleted"
            defaultValue={includeDeleted ? "1" : ""}
            options={[
              { value: "", label: "Hide deleted" },
              { value: "1", label: "Include deleted" },
            ]}
          />
        </AdminFilterBar>
        <AdminTable
          rows={data.rows}
          columns={columns}
          empty="No postings match those filters."
        />
        <AdminPagination
          basePath="/admin/jobs"
          searchParams={raw}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </section>
    </main>
  );
}
