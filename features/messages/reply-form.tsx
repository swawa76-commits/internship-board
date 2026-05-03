"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  replyAsCompanyAction,
  replyAsStudentAction,
  type MessageFormState,
} from "@/features/messages/actions";

const initial: MessageFormState = { status: "idle" };

/**
 * Reply composer reused by /student/messages/[threadId] and
 * /company/messages/[threadId]. The role tells us which server action
 * to bind. We remount the form on success via a key bumped from
 * `state.status` to clear the textarea cleanly under React 19 (the
 * useActionState reset story is still rough).
 */
export function ReplyForm({
  threadId,
  role,
}: {
  threadId: string;
  role: "STUDENT" | "COMPANY";
}) {
  const action =
    role === "STUDENT" ? replyAsStudentAction : replyAsCompanyAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok" && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <div className="space-y-1.5">
        <Label htmlFor="body">Reply</Label>
        <Textarea
          id="body"
          name="body"
          rows={4}
          maxLength={4000}
          required
          placeholder="Write a reply…"
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
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
