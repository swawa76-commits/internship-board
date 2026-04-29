import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

/**
 * Edge-runtime "proxy" (formerly middleware in Next.js <= 15).
 *
 * Uses the slim, dependency-free `authConfig` (no Prisma, no bcrypt) so
 * it can run on the Edge. The `authorized` callback in `lib/auth/config.ts`
 * performs:
 *   1. signed-in check on /student, /company, /admin
 *   2. role-based redirect for mismatched users
 *
 * Authorization is *also* enforced in server actions, route handlers,
 * and service-layer guards — this is the coarse outer layer.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Don't run on Next internals or static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
