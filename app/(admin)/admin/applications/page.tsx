import Link from "next/link";

import {
  AdminFilterBar,
  SelectField,
  TextField,
} from "@/features/admin/admin-filter-bar";
import { AdminPagination } from "@/features/admin/admin-pagination";
import { AdminTable, type AdminTableColumn } from "@/features/admin/admin-table";
import type { ApplicationStatus } from "@/lib/db/generated/enums";
import { requireRole } from "@/lib/auth/guards";
import {
  ADMIN_PAGE_SIZE,
  type AdminApplicationRow,
} from "@/server/repositories/admin-repository";
import {
  listApplicationsPageForAdmin,
  listFilterCompaniesForAdmin,
} from "@/server/services/admin-service";
import { listProgramTags } from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin · Applications",
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "APPLIED", label: "Applied" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];
const VALID_STATUSES = new Set([
  "APPLIED",
  "IN_REVIEW",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
]);

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminApplicationsPage({
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
  const studentProfileId = readParam(raw.studentProfileId).trim() || undefined;
  const jobPostingId = readParam(raw.jobPostingId).trim() || undefined;
  const page = Math.max(1, Number.parseInt(readParam(raw.page) || "1", 10) || 1);

  const status = VALID_STATUSES.has(statusRaw)
    ? (statusRaw as ApplicationStatus)
    : undefined;

  const [pageR, tagsR, coR] = await Promise.all([
    listApplicationsPageForAdmin(
      user.id,
      {
        q,
        status,
        companyProfileId,
        studentProfileId,
        jobPostingId,
        programTag,
      },
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
    Boolean(studentProfileId) ||
    Boolean(jobPostingId);

  const columns: AdminTableColumn<AdminApplicationRow>[] = [
    {
      key: "student",
      header: "Student",
      width: "wide",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.student.fullName}</p>
          <p className="text-xs text-muted-foreground">{r.student.email}</p>
        </div>
      ),
    },
    {
      key: "posting",
      header: "Posting",
      width: "wide",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.jobPosting.title}</p>
          <p className="text-xs text-muted-foreground">
            {r.company.companyName}
            {r.jobPosting.programTag ? <> · tag {r.jobPosting.programTag}</> : null}
            {r.jobPosting.status !== "PUBLISHED" ? (
              <>
                {" "}
                · <span className="font-mono">{r.jobPosting.status}</span>
              </>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
          {r.status}
        </span>
      ),
    },
    {
      key: "applied",
      header: "Applied",
      cell: (r) => (
        <p className="text-xs text-muted-foreground">
          {r.appliedAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-6xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Read-only platform-wide view. Status changes belong to the
          owning company on /company/applications; admins observe rather
          than mutate the funnel here.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link className="hover:text-foreground hover:underline" href="/admin">
            ← Dashboard
          </Link>
        </p>
      </header>
      <section className="mx-auto w-full max-w-6xl space-y-3">
        <AdminFilterBar resetHref="/admin/applications" hasAny={hasFilters}>
          <TextField
            name="q"
            label="Search"
            defaultValue={q}
            placeholder="Student, email, posting, company"
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
        </AdminFilterBar>
        <AdminTable
          rows={data.rows}
          columns={columns}
          empty="No applications match those filters."
        />
        <AdminPagination
          basePath="/admin/applications"
          searchParams={raw}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </section>
    </main>
  );
}
