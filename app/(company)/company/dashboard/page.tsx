import { LogoutButton } from "@/features/auth/logout-button";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { requireRole } from "@/lib/auth/guards";

export const metadata = {
  title: "Company dashboard",
};

export default async function CompanyDashboardPage() {
  const user = await requireRole("COMPANY");

  // Fresh DB read, never the JWT — admins may have changed status mid-session.
  const approval = await getFreshCompanyApprovalStatus(user.id);

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-12">
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Company dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email ?? "unknown"}.
            {approval ? (
              <>
                {" · Approval status: "}
                <span className="font-medium text-foreground">{approval}</span>
              </>
            ) : null}
          </p>
        </div>
        <LogoutButton />
      </header>
    </main>
  );
}
