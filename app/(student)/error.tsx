"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function StudentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Student
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load this page. Your data is safe — try again.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/student/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
