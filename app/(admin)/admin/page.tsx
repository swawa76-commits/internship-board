import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import { requireRole } from "@/lib/auth/guards";

export const metadata = {
  title: "Admin dashboard",
};

export default async function AdminDashboardPage() {
  const user = await requireRole("ADMIN");

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "your account"}.
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="mx-auto w-full max-w-5xl rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Marketplace metrics, moderation, and management tools land here in
          Tasks 15 and 16. Use the navigation above to jump into the
          per-entity admin tables once they exist.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-2">
        <AdminCard
          title="Companies"
          description="Approve, suspend, and review pending company sign-ups."
          ctaHref="/admin/companies"
          ctaLabel="Open companies"
        />
        <AdminCard
          title="Job postings"
          description="Inspect postings across the platform and intervene when needed."
          ctaHref="/admin/jobs"
          ctaLabel="Open postings"
        />
        <AdminCard
          title="Students"
          description="Browse student accounts and profile completeness."
          ctaHref="/admin/students"
          ctaLabel="Open students"
        />
        <AdminCard
          title="Applications"
          description="See application activity across all postings."
          ctaHref="/admin/applications"
          ctaLabel="Open applications"
        />
      </section>
    </main>
  );
}

function AdminCard({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline" size="sm" className="mt-auto self-start">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </article>
  );
}
