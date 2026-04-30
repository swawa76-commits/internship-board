import { AdminCompaniesList } from "@/features/admin/companies-list";
import { requireRole } from "@/lib/auth/guards";
import { listCompaniesForAdmin } from "@/server/services/admin-service";

export const metadata = {
  title: "Admin · Companies",
};

export default async function AdminCompaniesPage() {
  await requireRole("ADMIN");
  const companies = await listCompaniesForAdmin();

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Companies</h1>
        <p className="text-sm text-muted-foreground">
          Approve, suspend, or move a company back to pending. Approval
          changes are logged to the activity feed. Polished filters,
          search, and bulk actions land in Task 16.
        </p>
      </header>
      <section className="mx-auto w-full max-w-5xl">
        <AdminCompaniesList rows={companies} />
      </section>
    </main>
  );
}
