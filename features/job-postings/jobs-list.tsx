import Link from "next/link";

import { Button } from "@/components/ui/button";
import { softDeleteJobPostingAction } from "@/features/job-postings/actions";
import type { JobPostingListItem } from "@/server/services/job-posting-service";

export function JobsList({ rows }: { rows: JobPostingListItem[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No job postings yet. Create your first one to start receiving
          applications.
        </p>
        <Button asChild className="mt-4">
          <Link href="/company/jobs/new">New posting</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Workplace</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border last:border-b-0"
            >
              <td className="px-3 py-3 align-top">
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">/{row.slug}</p>
              </td>
              <td className="px-3 py-3 align-top">
                <span className="inline-block rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs">
                  {row.status}
                </span>
              </td>
              <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                {row.workplaceType}
              </td>
              <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                {row.updatedAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/company/jobs/${row.id}/edit`}>Edit</Link>
                  </Button>
                  <form action={softDeleteJobPostingAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${row.title}`}
                    >
                      Delete
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
