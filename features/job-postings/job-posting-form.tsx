"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createJobPostingAction,
  updateJobPostingAction,
  type JobPostingFormState,
  type JobPostingValues,
} from "@/features/job-postings/actions";
import type { CompanyApprovalStatus } from "@/lib/db/generated/enums";

export type JobPostingFormDefaults = {
  title: string;
  department: string;
  location: string;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE";
  internshipTerm: string;
  startDate: string;
  duration: string;
  compensationType: string;
  compensationMin: string;
  compensationMax: string;
  description: string;
  responsibilities: string;
  qualifications: string;
  applicationDeadline: string;
  programTag: string;
  status: "DRAFT" | "PUBLISHED";
};

export const EMPTY_JOB_POSTING_DEFAULTS: JobPostingFormDefaults = {
  title: "",
  department: "",
  location: "",
  workplaceType: "REMOTE",
  internshipTerm: "",
  startDate: "",
  duration: "",
  compensationType: "",
  compensationMin: "",
  compensationMax: "",
  description: "",
  responsibilities: "",
  qualifications: "",
  applicationDeadline: "",
  programTag: "",
  status: "DRAFT",
};

const initial: JobPostingFormState = { status: "idle" };

type Mode =
  | { kind: "create" }
  | { kind: "edit"; jobPostingId: string };

export function JobPostingForm({
  mode,
  defaults,
  approvalStatus,
}: {
  mode: Mode;
  defaults: JobPostingFormDefaults;
  approvalStatus: CompanyApprovalStatus | null;
}) {
  // Bind the id into the update action so the form's `formData`
  // surface stays clean (no hidden `id` field that a malicious user
  // could swap to point at another posting).
  const action =
    mode.kind === "create"
      ? createJobPostingAction
      : updateJobPostingAction.bind(null, mode.jobPostingId);

  const [state, formAction, pending] = useActionState(action, initial);

  // On an error return, the action echoes the user's submitted values
  // back via state. We merge them over the original defaults and key
  // the form on `attempt` so React remounts inputs with the new
  // defaults — this defeats React 19's automatic form reset on action
  // completion and preserves what the user typed.
  const effectiveDefaults: JobPostingFormDefaults =
    state.status === "error"
      ? mergeValuesIntoDefaults(defaults, state.values)
      : defaults;
  const formKey =
    state.status === "error" ? `attempt-${state.attempt}` : "initial";

  return (
    <form action={formAction} key={formKey} className="space-y-6">
      {approvalStatus && approvalStatus !== "APPROVED" ? (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          Your company is currently <b>{approvalStatus}</b>. You can save
          drafts now; publishing requires an admin to approve your account.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" required>
          <Input
            id="title"
            name="title"
            required
            maxLength={160}
            defaultValue={effectiveDefaults.title}
          />
        </Field>
        <Field id="department" label="Department / team">
          <Input
            id="department"
            name="department"
            maxLength={120}
            defaultValue={effectiveDefaults.department}
          />
        </Field>
        <Field id="location" label="Location">
          <Input
            id="location"
            name="location"
            maxLength={160}
            defaultValue={effectiveDefaults.location}
            placeholder="City, State / Country or Remote"
          />
        </Field>
        <Field id="workplaceType" label="Workplace type" required>
          <Select
            id="workplaceType"
            name="workplaceType"
            defaultValue={effectiveDefaults.workplaceType}
          >
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">Onsite</option>
          </Select>
        </Field>
        <Field id="internshipTerm" label="Internship term">
          <Select
            id="internshipTerm"
            name="internshipTerm"
            defaultValue={effectiveDefaults.internshipTerm}
          >
            <option value="">Unspecified</option>
            <option value="SUMMER">Summer</option>
            <option value="FALL">Fall</option>
            <option value="WINTER">Winter</option>
            <option value="SPRING">Spring</option>
            <option value="YEAR_ROUND">Year-round</option>
          </Select>
        </Field>
        <Field id="startDate" label="Start date">
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={effectiveDefaults.startDate}
          />
        </Field>
        <Field id="duration" label="Duration">
          <Input
            id="duration"
            name="duration"
            maxLength={80}
            defaultValue={effectiveDefaults.duration}
            placeholder="e.g. 12 weeks"
          />
        </Field>
        <Field id="applicationDeadline" label="Application deadline">
          <Input
            id="applicationDeadline"
            name="applicationDeadline"
            type="date"
            defaultValue={effectiveDefaults.applicationDeadline}
          />
        </Field>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Compensation</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="compensationType" label="Type">
            <Select
              id="compensationType"
              name="compensationType"
              defaultValue={effectiveDefaults.compensationType}
            >
              <option value="">Unspecified</option>
              <option value="PAID">Paid</option>
              <option value="STIPEND">Stipend</option>
              <option value="UNPAID">Unpaid</option>
            </Select>
          </Field>
          <Field id="compensationMin" label="Min ($)">
            <Input
              id="compensationMin"
              name="compensationMin"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={effectiveDefaults.compensationMin}
            />
          </Field>
          <Field id="compensationMax" label="Max ($)">
            <Input
              id="compensationMax"
              name="compensationMax"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={effectiveDefaults.compensationMax}
            />
          </Field>
        </div>
      </fieldset>

      <Field
        id="description"
        label="Description"
        required
        hint="Sets the scene — what the team does and what an intern will work on."
      >
        <Textarea
          id="description"
          name="description"
          required
          rows={6}
          maxLength={8000}
          defaultValue={effectiveDefaults.description}
        />
      </Field>
      <Field id="responsibilities" label="Responsibilities">
        <Textarea
          id="responsibilities"
          name="responsibilities"
          rows={4}
          maxLength={4000}
          defaultValue={effectiveDefaults.responsibilities}
        />
      </Field>
      <Field id="qualifications" label="Qualifications">
        <Textarea
          id="qualifications"
          name="qualifications"
          rows={4}
          maxLength={4000}
          defaultValue={effectiveDefaults.qualifications}
        />
      </Field>

      <Field id="programTag" label="Program tag" hint="Optional cohort label.">
        <Input
          id="programTag"
          name="programTag"
          maxLength={60}
          defaultValue={effectiveDefaults.programTag}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          variant="outline"
          name="status"
          value="DRAFT"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save as draft"}
        </Button>
        <Button
          type="submit"
          name="status"
          value="PUBLISHED"
          disabled={pending}
        >
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </form>
  );
}

function mergeValuesIntoDefaults(
  defaults: JobPostingFormDefaults,
  values: JobPostingValues,
): JobPostingFormDefaults {
  // Only echo back values for the fields the form owns. Coerce
  // workplaceType + status back into their literal-typed shapes so
  // TypeScript stays happy; everything else is a free-form string.
  return {
    ...defaults,
    title: values.title ?? defaults.title,
    department: values.department ?? defaults.department,
    location: values.location ?? defaults.location,
    workplaceType:
      values.workplaceType === "REMOTE" ||
      values.workplaceType === "HYBRID" ||
      values.workplaceType === "ONSITE"
        ? values.workplaceType
        : defaults.workplaceType,
    internshipTerm: values.internshipTerm ?? defaults.internshipTerm,
    startDate: values.startDate ?? defaults.startDate,
    duration: values.duration ?? defaults.duration,
    compensationType: values.compensationType ?? defaults.compensationType,
    compensationMin: values.compensationMin ?? defaults.compensationMin,
    compensationMax: values.compensationMax ?? defaults.compensationMax,
    description: values.description ?? defaults.description,
    responsibilities: values.responsibilities ?? defaults.responsibilities,
    qualifications: values.qualifications ?? defaults.qualifications,
    applicationDeadline:
      values.applicationDeadline ?? defaults.applicationDeadline,
    programTag: values.programTag ?? defaults.programTag,
    status:
      values.status === "PUBLISHED" || values.status === "DRAFT"
        ? values.status
        : defaults.status,
  };
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

function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
    />
  );
}
