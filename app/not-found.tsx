import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          That page doesn&apos;t exist, or it&apos;s been removed.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild size="sm">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/jobs">Browse internships</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
