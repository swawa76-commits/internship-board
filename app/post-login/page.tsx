import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/guards";

/**
 * Post-login dispatcher. The login form sends users here so we can read
 * the session role server-side and route them to the right dashboard
 * without keeping that logic in the form component.
 */
export default async function PostLoginPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.role === "STUDENT") redirect("/student/dashboard");
  if (user.role === "COMPANY") redirect("/company/dashboard");
  if (user.role === "ADMIN") redirect("/admin");

  redirect("/");
}
