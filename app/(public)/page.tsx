import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          V1 · Internship Marketplace
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Connect students with internship opportunities.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          A focused job board for internship programs. Companies publish
          openings, students apply, and program admins keep the marketplace
          healthy.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/jobs">Browse internships</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
