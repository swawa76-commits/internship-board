import { LogoutButton } from "@/features/auth/logout-button";
import { requireRole } from "@/lib/auth/guards";

export const metadata = {
  title: "Admin dashboard",
};

export default async function AdminDashboardPage() {
  const user = await requireRole("ADMIN");

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "unknown"}.
          </p>
        </div>
        <LogoutButton />
      </header>
    </main>
  );
}
