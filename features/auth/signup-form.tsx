"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signupAction, type AuthFormState } from "@/features/auth/actions";

const initial: AuthFormState = { status: "idle" };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">I am a…</legend>
        <div className="flex gap-3">
          <label className="flex-1 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-accent">
            <input
              type="radio"
              name="role"
              value="STUDENT"
              defaultChecked
              className="mr-2"
            />
            Student
          </label>
          <label className="flex-1 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-accent">
            <input type="radio" name="role" value="COMPANY" className="mr-2" />
            Company
          </label>
        </div>
      </fieldset>

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
