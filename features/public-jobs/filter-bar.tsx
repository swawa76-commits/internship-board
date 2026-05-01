import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FilterBarValues = {
  q: string;
  workplaceType: string;
  internshipTerm: string;
  compensationType: string;
};

/**
 * URL-driven filter form. Submitting the form navigates to /jobs with
 * the new query string; clearing a filter is just removing it from the
 * URL. No client state, no JavaScript dependency — works as a plain
 * GET form even with JS disabled.
 */
export function FilterBar({
  values,
  hasAnyFilter,
}: {
  values: FilterBarValues;
  hasAnyFilter: boolean;
}) {
  return (
    <form
      method="GET"
      action="/jobs"
      className="rounded-md border border-border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="q">Keyword</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="Title or description"
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workplaceType">Workplace</Label>
          <FilterSelect
            id="workplaceType"
            name="workplaceType"
            defaultValue={values.workplaceType}
          >
            <option value="">Any</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">Onsite</option>
          </FilterSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="internshipTerm">Term</Label>
          <FilterSelect
            id="internshipTerm"
            name="internshipTerm"
            defaultValue={values.internshipTerm}
          >
            <option value="">Any</option>
            <option value="SUMMER">Summer</option>
            <option value="FALL">Fall</option>
            <option value="WINTER">Winter</option>
            <option value="SPRING">Spring</option>
            <option value="YEAR_ROUND">Year-round</option>
          </FilterSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="compensationType">Compensation</Label>
          <FilterSelect
            id="compensationType"
            name="compensationType"
            defaultValue={values.compensationType}
          >
            <option value="">Any</option>
            <option value="PAID">Paid</option>
            <option value="STIPEND">Stipend</option>
            <option value="UNPAID">Unpaid</option>
          </FilterSelect>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Filters apply when you submit. Share the URL to share results.
        </p>
        <div className="flex gap-2">
          {hasAnyFilter ? (
            <Link
              href="/jobs"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
            >
              Clear
            </Link>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply filters
          </button>
        </div>
      </div>
    </form>
  );
}

function FilterSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
    />
  );
}
