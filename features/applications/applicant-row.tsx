import Link from "next/link";

import { Button } from "@/components/ui/button";
import { transitionApplicationStatusAction } from "@/features/applications/actions";
import type { CompanyApplicantRow } from "@/server/services/application-service";

const NEXT_TARGETS: Record<
  string,
  Array<{
    target: "IN_REVIEW" | "INTERVIEWING" | "OFFER" | "REJECTED";
    label: string;
  }>
> = {
  APPLIED: [
    { target: "IN_REVIEW", label: "Move to review" },
    { target: "REJECTED", label: "Reject" },
  ],
  IN_REVIEW: [
    { target: "INTERVIEWING", label: "Move to interview" },
    { target: "REJECTED", label: "Reject" },
  ],
  INTERVIEWING: [
    { target: "OFFER", label: "Send offer" },
    { target: "REJECTED", label: "Reject" },
  ],
  OFFER: [{ target: "REJECTED", label: "Withdraw offer" }],
  REJECTED: [
    { target: "IN_REVIEW", label: "Reconsider" },
    { target: "INTERVIEWING", label: "Move to interview" },
  ],
  WITHDRAWN: [],
};

export function ApplicantRow({ row }: { row: CompanyApplicantRow }) {
  const transitions = NEXT_TARGETS[row.status] ?? [];
  return (
    <article className="space-y-3 rounded-md border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-medium">{row.studentProfile.fullName}</p>
          <p className="text-xs text-muted-foreground">
            {row.studentProfile.headline ?? "No headline"}
            {row.studentProfile.university ? (
              <> · {row.studentProfile.university}</>
            ) : null}
            {row.studentProfile.major ? (
              <> · {row.studentProfile.major}</>
            ) : null}
            {row.studentProfile.graduationYear ? (
              <> · Class of {row.studentProfile.graduationYear}</>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Applied {row.appliedAt.toLocaleDateString()} for{" "}
            <span className="font-medium text-foreground">
              {row.jobPosting.title}
            </span>
          </p>
        </div>
        <span className="inline-block rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs">
          {row.status}
        </span>
      </header>

      {row.coverLetter ? (
        <details className="rounded-md border border-border bg-background p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cover letter
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm">{row.coverLetter}</p>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {row.resumeStorageKeySnapshot ? (
          <a
            href={`/api/files/resume/snapshot/${encodeURIComponent(row.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline"
          >
            Open resume snapshot →
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">
            No resume on file
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/company/applications/${row.id}/message`}>
              Message
            </Link>
          </Button>
          {transitions.map((t) => (
            <form key={t.target} action={transitionApplicationStatusAction}>
              <input type="hidden" name="applicationId" value={row.id} />
              <input type="hidden" name="newStatus" value={t.target} />
              <Button
                type="submit"
                size="sm"
                variant={t.target === "REJECTED" ? "ghost" : "secondary"}
              >
                {t.label}
              </Button>
            </form>
          ))}
        </div>
      </div>
    </article>
  );
}
