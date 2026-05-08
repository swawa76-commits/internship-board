"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { runEmailDiagnosticAction } from "@/features/admin/actions";
import type { EmailDiagnosticResult } from "@/server/services/email-service";

/**
 * Operator email diagnostic card. Renders inside the /admin dashboard.
 * Submits to `runEmailDiagnosticAction`; the action returns a sanitized
 * `EmailDiagnosticResult` which we render inline.
 *
 * The button is the only input — recipient is fixed server-side to the
 * authenticated admin's own DB email.
 */
export function EmailDiagnosticForm() {
  const [state, formAction, isPending] = useActionState<
    EmailDiagnosticResult | null,
    FormData
  >(runEmailDiagnosticAction, null);

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Operator email diagnostic
        </h2>
        <p className="text-sm text-muted-foreground">
          Sends one test email to your admin email through the same path
          production notifications use. This tests the currently deployed
          Vercel runtime&apos;s email configuration — not your local env.
        </p>
      </header>

      <form action={formAction} className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send diagnostic email"}
        </Button>
      </form>

      {state ? <DiagnosticResultPanel result={state} /> : null}
    </section>
  );
}

function DiagnosticResultPanel({ result }: { result: EmailDiagnosticResult }) {
  const tone = result.ok
    ? "border-border bg-muted/40 text-foreground"
    : "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground";
  return (
    <dl
      role="status"
      aria-label={`Email diagnostic ${result.ok ? "succeeded" : "failed"}`}
      className={`mt-4 grid gap-2 rounded-md border px-4 py-3 text-sm sm:grid-cols-2 ${tone}`}
    >
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Provider
        </dt>
        <dd className="font-mono">{result.provider}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recipient
        </dt>
        <dd className="font-mono">{result.recipientMasked}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Result
        </dt>
        <dd className="font-mono">{result.ok ? "ok" : "FAILED"}</dd>
      </div>
      {result.error ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Error
          </dt>
          <dd className="break-words font-mono">{result.error}</dd>
        </div>
      ) : null}
    </dl>
  );
}
