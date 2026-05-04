"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Public route-group error boundary. Caught when a server component
 * in /, /jobs, /companies/* throws. We deliberately don't render the
 * `error.message` — server errors can carry sensitive context, and
 * the structured server log already has the full picture.
 */
export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load this page. The error has been logged.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
