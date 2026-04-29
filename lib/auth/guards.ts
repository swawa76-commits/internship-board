import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/db/generated/enums";

export type SessionUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  name?: string | null;
};

/**
 * Returns the current session user or `null` if unauthenticated.
 * Use in places that render different UI for guest vs. signed-in users.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Server-component / server-action guard: redirects to `/login` if the
 * caller is not authenticated. Always returns a session user.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Server-component / server-action guard: requires a specific role.
 * Redirects to `/login` if unauthenticated, `/` if signed in with the
 * wrong role.
 */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect("/");
  return user;
}
