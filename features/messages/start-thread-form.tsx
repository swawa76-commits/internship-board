"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  startThreadAsCompanyAction,
  type MessageFormState,
} from "@/features/messages/actions";

const initial: MessageFormState = { status: "idle" };

/**
 * Company-side composer that creates a brand-new thread for an
 * applicant. On success the action redirects into the new thread, so
 * we don't need to handle the "ok" path here — only render errors.
 */
export function StartThreadForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(
    startThreadAsCompanyAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="space-y-1.5">
        <Label htmlFor="start-body">First message</Label>
        <Textarea
          id="start-body"
          name="body"
          rows={4}
          maxLength={4000}
          required
          placeholder="Introduce yourself, share next steps, or ask a question."
        />
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
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send and open thread"}
        </Button>
      </div>
    </form>
  );
}
