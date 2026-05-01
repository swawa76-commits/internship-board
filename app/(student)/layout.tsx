import Link from "next/link";

/**
 * Route-group layout for /student/*. Provides a thin top bar and a
 * consistent content frame. The proxy and per-page `requireRole` guard
 * still run independently — this layout is presentational only.
 */
export default function StudentRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link
            href="/student/dashboard"
            className="font-semibold tracking-tight"
          >
            Student
          </Link>
          <nav className="flex items-center gap-4 text-muted-foreground">
            <Link className="hover:text-foreground" href="/student/dashboard">
              Dashboard
            </Link>
            <Link className="hover:text-foreground" href="/student/applications">
              Applications
            </Link>
            <Link className="hover:text-foreground" href="/student/saved-job-postings">
              Saved
            </Link>
            <Link className="hover:text-foreground" href="/jobs">
              Browse
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
