"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Admin route-group error boundary. We don't surface the underlying
 * error message — admin queries can include row counts or filter
 * details that aren't worth leaking through a UI string.
 */
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t load that page
        </h1>
        <p className="text-sm text-muted-foreground">
          Check the server log for details. The previous admin state is
          intact.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
