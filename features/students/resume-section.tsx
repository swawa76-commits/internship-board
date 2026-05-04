"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteResumeAction,
  uploadResumeAction,
  type ProfileFormState,
} from "@/features/students/actions";

const initial: ProfileFormState = { status: "idle" };

export function ResumeSection({ currentKey }: { currentKey: string | null }) {
  const [state, formAction, pending] = useActionState(
    uploadResumeAction,
    initial,
  );

  return (
    <div className="space-y-4">
      {currentKey ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-background p-3 text-sm">
          <div>
            <p className="font-medium">Resume on file</p>
            <p className="text-xs text-muted-foreground">
              <a
                href={`/api/files/resume/${encodeURIComponent(currentKey)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Download / preview
              </a>
            </p>
          </div>
          <form action={deleteResumeAction}>
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No resume yet. Upload a PDF, DOC, or DOCX (5 MB max).
        </p>
      )}

      <form
        action={formAction}
        className="space-y-3 rounded-md border border-dashed border-border p-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="resume">
            {currentKey ? "Replace resume" : "Upload resume"}
          </Label>
          <Input
            id="resume"
            name="resume"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
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
        {state.status === "ok" ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            {state.message ?? "Saved."}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </div>
  );
}
