import { Button } from "@/components/ui/button";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";
import { setCompanyApprovalAction } from "@/features/admin/actions";

export type AdminCompanyRow = {
  id: string;
  companyName: string;
  slug: string;
  approvalStatus: CompanyApprovalStatus;
  contactEmail: string | null;
  updatedAt: Date;
};

/**
 * Minimal admin companies table. Task 8 explicitly excludes search,
 * filtering, pagination, bulk actions, and polished management UX —
 * those land in Task 16. This table is functional-grade so an admin can
 * drive the workflow during dev.
 */
export function AdminCompaniesList({ rows }: { rows: AdminCompanyRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No companies yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-3 align-top">
                <p className="font-medium">{row.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  /{row.slug}
                  {row.contactEmail ? <> · {row.contactEmail}</> : null}
                </p>
              </td>
              <td className="px-3 py-3 align-top">
                <StatusBadge status={row.approvalStatus} />
              </td>
              <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                {row.updatedAt.toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex flex-wrap justify-end gap-2">
                  <ApprovalButton
                    companyProfileId={row.id}
                    target="APPROVED"
                    current={row.approvalStatus}
                  />
                  <ApprovalButton
                    companyProfileId={row.id}
                    target="PENDING"
                    current={row.approvalStatus}
                  />
                  <ApprovalButton
                    companyProfileId={row.id}
                    target="SUSPENDED"
                    current={row.approvalStatus}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL: Record<CompanyApprovalStatus, string> = {
  APPROVED: "Approve",
  PENDING: "Set pending",
  SUSPENDED: "Suspend",
};

function ApprovalButton({
  companyProfileId,
  target,
  current,
}: {
  companyProfileId: string;
  target: CompanyApprovalStatus;
  current: CompanyApprovalStatus;
}) {
  const isCurrent = target === current;
  return (
    <form action={setCompanyApprovalAction}>
      <input type="hidden" name="companyProfileId" value={companyProfileId} />
      <input type="hidden" name="newStatus" value={target} />
      <Button
        type="submit"
        size="sm"
        variant={target === "SUSPENDED" ? "destructive" : "outline"}
        disabled={isCurrent}
        aria-label={`${STATUS_LABEL[target]} ${companyProfileId}`}
      >
        {STATUS_LABEL[target]}
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
