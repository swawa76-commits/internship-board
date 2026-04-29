import type { CompanyCompletenessResult } from "@/lib/companies/completeness";

export function CompanyCompletenessMeter({
  completeness,
}: {
  completeness: CompanyCompletenessResult;
}) {
  const { percent, isComplete, missing } = completeness;
  return (
    <div
      className="rounded-md border border-border bg-card p-4"
      role="region"
      aria-label="Profile completeness"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Profile completeness
          </p>
          <p className="text-xs text-muted-foreground">
            {isComplete
              ? "Your profile is ready to publish job postings."
              : `${missing.length} item${missing.length === 1 ? "" : "s"} left.`}
          </p>
        </div>
        <span
          aria-live="polite"
          className="font-mono text-sm font-medium tabular-nums"
        >
          {percent}%
        </span>
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-foreground transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {!isComplete && missing.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {missing.map((m) => (
            <li
              key={m}
              className="rounded-full border border-border bg-background px-2 py-0.5"
            >
              {m}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
