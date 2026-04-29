import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/guards";
import { decideLandingFor } from "@/server/services/onboarding-service";

/**
 * Post-login dispatcher. The login form sends users here so we can read
 * the session role server-side AND check the user's onboarding state in
 * the database before routing them to the right place.
 */
export default async function PostLoginPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const target = await decideLandingFor(user.role, user.id);
  redirect(target);
}
