"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveProfileBasicsAction,
  type ProfileFormState,
} from "@/features/students/actions";

export type ProfileBasicsDefaults = {
  fullName: string;
  headline: string;
  university: string;
  graduationYear: string;
  degree: string;
  major: string;
  location: string;
  workAuthorization: string;
  bio: string;
  portfolioUrl: string;
  linkedinUrl: string;
  githubUrl: string;
  programTag: string;
};

const initial: ProfileFormState = { status: "idle" };

export function ProfileBasicsForm({
  defaults,
}: {
  defaults: ProfileBasicsDefaults;
}) {
  const [state, formAction, pending] = useActionState(
    saveProfileBasicsAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" required>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={defaults.fullName}
            required
            maxLength={120}
          />
        </Field>
        <Field id="headline" label="Headline" hint="One-line summary.">
          <Input
            id="headline"
            name="headline"
            defaultValue={defaults.headline}
            maxLength={160}
          />
        </Field>
        <Field id="university" label="University">
          <Input
            id="university"
            name="university"
            defaultValue={defaults.university}
            maxLength={120}
          />
        </Field>
        <Field id="graduationYear" label="Graduation year">
          <Input
            id="graduationYear"
            name="graduationYear"
            type="number"
            inputMode="numeric"
            defaultValue={defaults.graduationYear}
          />
        </Field>
        <Field id="degree" label="Degree">
          <Input
            id="degree"
            name="degree"
            defaultValue={defaults.degree}
            maxLength={80}
          />
        </Field>
        <Field id="major" label="Major">
          <Input
            id="major"
            name="major"
            defaultValue={defaults.major}
            maxLength={120}
          />
        </Field>
        <Field id="location" label="Location">
          <Input
            id="location"
            name="location"
            defaultValue={defaults.location}
            maxLength={120}
          />
        </Field>
        <Field id="workAuthorization" label="Work authorization">
          <Input
            id="workAuthorization"
            name="workAuthorization"
            defaultValue={defaults.workAuthorization}
            maxLength={120}
            placeholder="e.g. US citizen, F1 + OPT eligible"
          />
        </Field>
      </div>

      <Field id="bio" label="Bio" hint="A few sentences about you.">
        <Textarea
          id="bio"
          name="bio"
          defaultValue={defaults.bio}
          rows={5}
          maxLength={2000}
        />
      </Field>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Links</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="portfolioUrl" label="Portfolio">
            <Input
              id="portfolioUrl"
              name="portfolioUrl"
              type="url"
              inputMode="url"
              defaultValue={defaults.portfolioUrl}
              placeholder="https://"
            />
          </Field>
          <Field id="linkedinUrl" label="LinkedIn">
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              type="url"
              inputMode="url"
              defaultValue={defaults.linkedinUrl}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field id="githubUrl" label="GitHub">
            <Input
              id="githubUrl"
              name="githubUrl"
              type="url"
              inputMode="url"
              defaultValue={defaults.githubUrl}
              placeholder="https://github.com/…"
            />
          </Field>
        </div>
      </fieldset>

      <Field id="programTag" label="Program tag" hint="Optional cohort label.">
        <Input
          id="programTag"
          name="programTag"
          defaultValue={defaults.programTag}
          maxLength={60}
        />
      </Field>

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
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
