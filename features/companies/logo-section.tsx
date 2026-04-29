"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteLogoAction,
  uploadLogoAction,
  type CompanyFormState,
} from "@/features/companies/actions";

const initial: CompanyFormState = { status: "idle" };

export function LogoSection({ currentKey }: { currentKey: string | null }) {
  const [state, formAction, pending] = useActionState(
    uploadLogoAction,
    initial,
  );

  return (
    <div className="space-y-4">
      {currentKey ? (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            {/* Logos are public-read, so the route doesn't need a session. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/logo/${encodeURIComponent(currentKey)}`}
              alt="Company logo preview"
              className="size-12 rounded-md border border-border bg-muted object-contain"
            />
            <div>
              <p className="text-sm font-medium">Logo on file</p>
              <p className="text-xs text-muted-foreground">
                Visible on public listings and your company page.
              </p>
            </div>
          </div>
          <form action={deleteLogoAction}>
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No logo yet. Upload a square PNG, JPG, WebP, or SVG (2 MB max).
        </p>
      )}

      <form
        action={formAction}
        className="space-y-3 rounded-md border border-dashed border-border p-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="logo">
            {currentKey ? "Replace logo" : "Upload logo"}
          </Label>
          <Input
            id="logo"
            name="logo"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
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
