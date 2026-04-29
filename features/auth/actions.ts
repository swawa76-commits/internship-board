"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema, signupSchema } from "@/features/auth/schemas";
import { createUserWithCredentials } from "@/server/services/auth-service";

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok" };

/**
 * Where to send a freshly-signed-up user. We always send them through
 * onboarding because we know on creation that no profile row exists yet;
 * `decideLandingFor` would arrive at the same answer with an extra DB
 * round-trip.
 */
const ONBOARDING_BY_SIGNUP_ROLE = {
  STUDENT: "/student/onboarding",
  COMPANY: "/company/onboarding",
} as const;

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Please correct the highlighted fields.",
    };
  }

  const result = await createUserWithCredentials(parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      message: "An account with that email already exists.",
    };
  }

  // Sign the new user in immediately, then route to their dashboard.
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        status: "error",
        message: "Account created, but sign-in failed. Try logging in.",
      };
    }
    throw err;
  }

  redirect(ONBOARDING_BY_SIGNUP_ROLE[parsed.data.role]);
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { status: "error", message: "Invalid email or password." };
    }
    throw err;
  }

  // Defer to a generic post-login route that redirects by role; that page
  // is the only place where we look up the user's role server-side.
  redirect("/post-login");
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/");
}
