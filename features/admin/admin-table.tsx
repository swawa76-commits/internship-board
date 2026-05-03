import type { ReactNode } from "react";

/**
 * Lightweight table primitive shared by every /admin/* list view.
 * Deliberately thin: column defs are inline, rendering is plain TSX,
 * filtering and pagination live in the URL — not in this component.
 *
 * Render-cost rationale: keeping this dumb avoids the React 19 client-
 * island sprawl that a "DataGrid" abstraction would invite for these
 * server-rendered, pagination-based admin tables.
 */
export type AdminTableColumn<T> = {
  key: string;
  header: string;
  /** Right-align numeric / action columns. */
  align?: "left" | "right";
  /** Treat the cell as a wide content column (for layout balance). */
  width?: "auto" | "narrow" | "wide";
  cell: (row: T) => ReactNode;
};

export function AdminTable<T extends { id: string }>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: AdminTableColumn<T>[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""} ${c.width === "narrow" ? "w-32" : c.width === "wide" ? "w-1/3" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-3 align-top ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
