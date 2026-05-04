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
import {
  setCompanyApprovalAction,
  softDeleteCompanyAdminAction,
} from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";
import { requireRole } from "@/lib/auth/guards";
import {
  ADMIN_PAGE_SIZE,
  type AdminCompanyRow,
} from "@/server/repositories/admin-repository";
import { listCompaniesPageForAdmin } from "@/server/services/admin-service";
import { listProgramTags } from "@/server/services/admin-metrics-service";

export const metadata = {
  title: "Admin · Companies",
};

const APPROVAL_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "SUSPENDED", label: "Suspended" },
];

const VALID_APPROVALS = new Set(["PENDING", "APPROVED", "SUSPENDED"]);

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("ADMIN");
  const raw = await searchParams;

  const q = readParam(raw.q).trim();
  const approvalRaw = readParam(raw.approvalStatus).trim();
  const programTag = readParam(raw.programTag).trim() || null;
  const includeDeleted = readParam(raw.includeDeleted) === "1";
  const page = Math.max(
    1,
    Number.parseInt(readParam(raw.page) || "1", 10) || 1,
  );

  const approvalStatus = VALID_APPROVALS.has(approvalRaw)
    ? (approvalRaw as CompanyApprovalStatus)
    : undefined;

  const [pageR, tagsR] = await Promise.all([
    listCompaniesPageForAdmin(
      user.id,
      { q, approvalStatus, programTag, includeDeleted },
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
    Boolean(approvalStatus) ||
    Boolean(programTag) ||
    includeDeleted;

  const columns: AdminTableColumn<AdminCompanyRow>[] = [
    {
      key: "company",
      header: "Company",
      width: "wide",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.companyName}</p>
          <p className="text-xs text-muted-foreground">
            /{r.slug}
            {r.contactEmail ? <> · {r.contactEmail}</> : null}
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
          <StatusBadge status={r.approvalStatus} />
          {r.deletedAt ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
              DELETED
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "postings",
      header: "Postings",
      cell: (r) => <p className="font-mono text-xs">{r.jobPostingCount}</p>,
    },
    {
      key: "updated",
      header: "Updated",
      cell: (r) => (
        <p className="text-xs text-muted-foreground">
          {r.updatedAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-2">
          <ApprovalButton
            id={r.id}
            target="APPROVED"
            current={r.approvalStatus}
          />
          <ApprovalButton
            id={r.id}
            target="PENDING"
            current={r.approvalStatus}
          />
          <ApprovalButton
            id={r.id}
            target="SUSPENDED"
            current={r.approvalStatus}
          />
          {!r.deletedAt ? (
            <form action={softDeleteCompanyAdminAction}>
              <input type="hidden" name="id" value={r.id} />
              <ConfirmFormButton
                label="Delete"
                confirmMessage={`Soft-delete ${r.companyName}? Postings will hide publicly; data is recoverable.`}
              />
            </form>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-6xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Companies</h1>
        <p className="text-sm text-muted-foreground">
          Approve, suspend, or move a company back to pending. Soft-delete when
          the account should disappear from public surfaces. Approval changes
          log to the activity feed.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link className="hover:text-foreground hover:underline" href="/admin">
            ← Dashboard
          </Link>
        </p>
      </header>
      <section className="mx-auto w-full max-w-6xl space-y-3">
        <AdminFilterBar resetHref="/admin/companies" hasAny={hasFilters}>
          <TextField
            name="q"
            label="Search"
            defaultValue={q}
            placeholder="Name, slug, or email"
          />
          <SelectField
            name="approvalStatus"
            label="Approval"
            defaultValue={approvalRaw}
            options={APPROVAL_OPTIONS}
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
          empty="No companies match those filters."
        />
        <AdminPagination
          basePath="/admin/companies"
          searchParams={raw}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </section>
    </main>
  );
}

function ApprovalButton({
  id,
  target,
  current,
}: {
  id: string;
  target: CompanyApprovalStatus;
  current: CompanyApprovalStatus;
}) {
  const labels: Record<CompanyApprovalStatus, string> = {
    APPROVED: "Approve",
    PENDING: "Set pending",
    SUSPENDED: "Suspend",
  };
  const isCurrent = target === current;
  return (
    <form action={setCompanyApprovalAction}>
      <input type="hidden" name="companyProfileId" value={id} />
      <input type="hidden" name="newStatus" value={target} />
      <Button
        type="submit"
        size="sm"
        variant={target === "SUSPENDED" ? "destructive" : "outline"}
        disabled={isCurrent}
      >
        {labels[target]}
      </Button>
    </form>
  );
}

function StatusBadge({ status }: { status: CompanyApprovalStatus }) {
  const tone =
    status === "APPROVED"
      ? "border-border bg-card text-foreground"
      : status === "PENDING"
        ? "border-border bg-muted/40 text-foreground"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 font-mono text-xs ${tone}`}
    >
      {status}
    </span>
  );
}
