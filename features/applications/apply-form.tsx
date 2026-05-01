"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyToJobAction,
  type ApplyFormState,
} from "@/features/applications/actions";

const initial: ApplyFormState = { status: "idle" };

export function ApplyForm({ jobPostingId }: { jobPostingId: string }) {
  const [state, formAction, pending] = useActionState(
    applyToJobAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="jobPostingId" value={jobPostingId} />
      <div className="space-y-1.5">
        <Label htmlFor="coverLetter">Cover letter (optional)</Label>
        <Textarea
          id="coverLetter"
          name="coverLetter"
          rows={6}
          maxLength={4000}
          placeholder="A few sentences on why this role caught your eye."
        />
        <p className="text-xs text-muted-foreground">
          Your current resume will be attached automatically. The version
          you submit now is preserved even if you upload a new one later.
        </p>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </form>
  );
}
