import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center px-6 pb-16 pt-24">
        <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            PCI · Internship Marketplace
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Connect Penn innovation ventures with student talent
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            A PCI internship marketplace for matching students with
            high-impact startup and commercialization opportunities.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/jobs">Browse internships</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/signup">Create an account</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Log in
            </Link>
          </p>
        </div>
      </section>

      {/* Value props */}
      <section className="border-t border-border bg-muted/30 px-6 py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Built for everyone in the program
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Students, startups, and PCI operators each get a workflow
              tuned to what they actually need to do.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <article className="flex flex-col gap-3 rounded-lg border border-border bg-background p-6">
              <h3 className="text-lg font-semibold tracking-tight">
                For students
              </h3>
              <p className="text-sm text-muted-foreground">
                Discover internships connected to Penn innovation, startups,
                and commercialization projects. Build a strong profile,
                apply in a few clicks, and track every conversation in one
                place.
              </p>
            </article>
            <article className="flex flex-col gap-3 rounded-lg border border-border bg-background p-6">
              <h3 className="text-lg font-semibold tracking-tight">
                For startups
              </h3>
              <p className="text-sm text-muted-foreground">
                Reach motivated students who want hands-on experience
                building early-stage ventures and translating ideas into
                impact. Post openings, review applicants, and message
                candidates without leaving the marketplace.
              </p>
            </article>
            <article className="flex flex-col gap-3 rounded-lg border border-border bg-background p-6">
              <h3 className="text-lg font-semibold tracking-tight">
                For PCI operators
              </h3>
              <p className="text-sm text-muted-foreground">
                Give PCI a clear view of companies, postings, applications,
                and engagement. Approve new ventures, monitor activity, and
                keep the marketplace healthy from a single admin dashboard.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Three steps from sign-up to your first applicant or interview.
            </p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            <li className="flex flex-col gap-2 rounded-lg border border-border p-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step 1
              </span>
              <h3 className="text-lg font-semibold tracking-tight">
                Create your account
              </h3>
              <p className="text-sm text-muted-foreground">
                Sign up as a student or a startup. Students fill out a
                profile; companies set up their venture page.
              </p>
            </li>
            <li className="flex flex-col gap-2 rounded-lg border border-border p-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step 2
              </span>
              <h3 className="text-lg font-semibold tracking-tight">
                Post or browse internships
              </h3>
              <p className="text-sm text-muted-foreground">
                Approved companies publish openings. Students search and
                filter by term, workplace type, and program tag.
              </p>
            </li>
            <li className="flex flex-col gap-2 rounded-lg border border-border p-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step 3
              </span>
              <h3 className="text-lg font-semibold tracking-tight">
                Apply and connect
              </h3>
              <p className="text-sm text-muted-foreground">
                Students apply with a profile snapshot. Companies review,
                update statuses, and start direct message threads with
                applicants.
              </p>
            </li>
          </ol>
          <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/signup">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/jobs">Browse internships</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
