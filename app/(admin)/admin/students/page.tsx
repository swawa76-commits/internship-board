import Link from "next/link";

import {
  AdminFilterBar,
  SelectField,
  TextField,
} from "@/features/admin/admin-filter-bar";
import { AdminPagination } from "@/features/admin/admin-pagination";
import { AdminTable, type AdminTableColumn } from "@/features/admin/admin-table";
import { ConfirmFormButton } from "@/features/admin/confirm-form-button";
import { softDeleteStudentAdminAction } from "@/features/admin/actions";
import { requireRole } from "@/lib/auth/guards";
import {
  ADMIN_PAGE_SIZE,
  type AdminStudentRow,
} from "@/server/repositories/admin-repository";
import { listStudentsPageForAdmin } from "@/server/services/admin-service";
import { listProgramTags } from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin · Students",
};

const COMPLETENESS_OPTIONS = [
  { value: "", label: "Any completeness" },
  { value: "complete", label: "Complete profiles" },
  { value: "incomplete", label: "Incomplete profiles" },
];

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("ADMIN");
  const raw = await searchParams;

  const q = readParam(raw.q).trim();
  const completenessRaw = readParam(raw.completeness).trim();
  const programTag = readParam(raw.programTag).trim() || null;
  const includeDeleted = readParam(raw.includeDeleted) === "1";
  const page = Math.max(1, Number.parseInt(readParam(raw.page) || "1", 10) || 1);

  const completeness =
    completenessRaw === "complete" || completenessRaw === "incomplete"
      ? completenessRaw
      : undefined;

  const [pageR, tagsR] = await Promise.all([
    listStudentsPageForAdmin(
      user.id,
      { q, completeness, programTag, includeDeleted },
      { page, pageSize: ADMIN_PAGE_SIZE },
    ),
    listProgramTags(user.id),
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
  const data = pageR.data;
  const hasFilters =
    q.length > 0 ||
    Boolean(completeness) ||
    Boolean(programTag) ||
    includeDeleted;

  const columns: AdminTableColumn<AdminStudentRow>[] = [
    {
      key: "student",
      header: "Student",
      width: "wide",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.fullName}</p>
          <p className="text-xs text-muted-foreground">
            {r.email}
            {r.programTag ? <> · tag {r.programTag}</> : null}
          </p>
        </div>
      ),
    },
    {
      key: "education",
      header: "Education",
      cell: (r) => (
        <p className="text-xs text-muted-foreground">
          {r.university ?? "—"}
          {r.major ? <> · {r.major}</> : null}
          {r.graduationYear ? <> · {r.graduationYear}</> : null}
        </p>
      ),
    },
    {
      key: "profile",
      header: "Profile",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
              r.isProfileComplete
                ? "border-border bg-card"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {r.isProfileComplete ? "Complete" : "Incomplete"}
          </span>
          {r.userDeletedAt ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
              DELETED
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "applications",
      header: "Applications",
      cell: (r) => <p className="font-mono text-xs">{r.applicationCount}</p>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        !r.userDeletedAt ? (
          <form action={softDeleteStudentAdminAction}>
            <input type="hidden" name="id" value={r.userId} />
            <ConfirmFormButton
              label="Delete"
              confirmMessage={`Soft-delete ${r.fullName}'s account? Historical applications will remain visible to companies.`}
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
        <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          Browse all student accounts. Soft-deleting deactivates the user
          row (and frees their email for re-registration via the partial
          unique index) while preserving historical applications.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link className="hover:text-foreground hover:underline" href="/admin">
            ← Dashboard
          </Link>
        </p>
      </header>
      <section className="mx-auto w-full max-w-6xl space-y-3">
        <AdminFilterBar resetHref="/admin/students" hasAny={hasFilters}>
          <TextField
            name="q"
            label="Search"
            defaultValue={q}
            placeholder="Name, email, school"
          />
          <SelectField
            name="completeness"
            label="Profile"
            defaultValue={completenessRaw}
            options={COMPLETENESS_OPTIONS}
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
          empty="No students match those filters."
        />
        <AdminPagination
          basePath="/admin/students"
          searchParams={raw}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </section>
    </main>
  );
}
