import Link from "next/link";

/**
 * URL-driven pagination control. Pure presentation — the page-level
 * server component reads `?page=N` from search params and passes it
 * to the repository's `take`/`skip`. We never paginate in memory.
 *
 * Generates href strings that preserve the existing query string and
 * only swap the `page` value. Anchors are server-rendered <a> via
 * Next's <Link>, so navigation works without JS.
 */
export function AdminPagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        {total} {total === 1 ? "row" : "rows"}.
      </p>
    );
  }

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (Array.isArray(v)) {
        if (v[0]) sp.set(k, v[0]);
      } else if (v) {
        sp.set(k, v);
      }
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <nav className="flex items-center justify-between gap-3 px-1 py-2 text-xs text-muted-foreground">
      <p>
        Page {page} of {totalPages} · {total} {total === 1 ? "row" : "rows"}
      </p>
      <div className="flex items-center gap-3">
        {page > 1 ? (
          <Link className="font-medium hover:text-foreground" href={hrefFor(prev)}>
            ← Previous
          </Link>
        ) : (
          <span className="opacity-50">← Previous</span>
        )}
        {page < totalPages ? (
          <Link className="font-medium hover:text-foreground" href={hrefFor(next)}>
            Next →
          </Link>
        ) : (
          <span className="opacity-50">Next →</span>
        )}
      </div>
    </nav>
  );
}
