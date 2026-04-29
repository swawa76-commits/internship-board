import Link from "next/link";

/**
 * Route-group layout for /admin/*. The proxy and per-page `requireRole`
 * guard still run independently — this layout is presentational only.
 */
export default function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/admin" className="font-semibold tracking-tight">
            Admin
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground">
            <Link className="hover:text-foreground" href="/admin">
              Overview
            </Link>
            <Link className="hover:text-foreground" href="/admin/companies">
              Companies
            </Link>
            <Link className="hover:text-foreground" href="/admin/job-postings">
              Postings
            </Link>
            <Link className="hover:text-foreground" href="/admin/students">
              Students
            </Link>
            <Link className="hover:text-foreground" href="/admin/applications">
              Applications
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
