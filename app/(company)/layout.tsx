import Link from "next/link";

/**
 * Route-group layout for /company/*. The proxy and per-page `requireRole`
 * guard still run independently — this layout is presentational only.
 */
export default function CompanyRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link
            href="/company/dashboard"
            className="font-semibold tracking-tight"
          >
            Company
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground">
            <Link className="hover:text-foreground" href="/company/dashboard">
              Dashboard
            </Link>
            <Link className="hover:text-foreground" href="/company/jobs">
              Postings
            </Link>
            <Link className="hover:text-foreground" href="/company/applications">
              Applicants
            </Link>
            <Link className="hover:text-foreground" href="/company/messages">
              Messages
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
