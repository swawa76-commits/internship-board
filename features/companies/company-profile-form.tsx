"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveCompanyProfileAction,
  type CompanyFormState,
} from "@/features/companies/actions";

export type CompanyProfileDefaults = {
  companyName: string;
  industry: string;
  companySize: string;
  headquarters: string;
  shortDescription: string;
  description: string;
  contactEmail: string;
  websiteUrl: string;
  programTag: string;
};

const initial: CompanyFormState = { status: "idle" };

const COMPANY_SIZE_OPTIONS = [
  "1",
  "2-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
];

export function CompanyProfileForm({
  defaults,
}: {
  defaults: CompanyProfileDefaults;
}) {
  const [state, formAction, pending] = useActionState(
    saveCompanyProfileAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="companyName" label="Company name" required>
          <Input
            id="companyName"
            name="companyName"
            defaultValue={defaults.companyName}
            required
            maxLength={160}
          />
        </Field>
        <Field id="industry" label="Industry" required>
          <Input
            id="industry"
            name="industry"
            defaultValue={defaults.industry}
            maxLength={120}
          />
        </Field>
        <Field
          id="companySize"
          label="Company size"
          required
          hint="Headcount band."
        >
          <select
            id="companySize"
            name="companySize"
            defaultValue={defaults.companySize}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select…</option>
            {COMPANY_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field id="headquarters" label="Headquarters" required>
          <Input
            id="headquarters"
            name="headquarters"
            defaultValue={defaults.headquarters}
            maxLength={160}
            placeholder="City, State / Country"
          />
        </Field>
      </div>

      <Field
        id="shortDescription"
        label="Short description"
        required
        hint="One sentence — appears next to your name in listings."
      >
        <Input
          id="shortDescription"
          name="shortDescription"
          defaultValue={defaults.shortDescription}
          maxLength={280}
        />
      </Field>

      <Field
        id="description"
        label="Full description"
        required
        hint="Tell students who you are, what you build, and what an internship looks like."
      >
        <Textarea
          id="description"
          name="description"
          defaultValue={defaults.description}
          rows={6}
          maxLength={4000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contactEmail" label="Contact email" required>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            inputMode="email"
            defaultValue={defaults.contactEmail}
            maxLength={255}
          />
        </Field>
        <Field id="websiteUrl" label="Website">
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            inputMode="url"
            defaultValue={defaults.websiteUrl}
            placeholder="https://"
          />
        </Field>
      </div>

      <Field
        id="programTag"
        label="Program tag"
        hint="Optional cohort or program label used by the admin team."
      >
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
