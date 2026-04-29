import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — usable from `middleware.ts` because it has no
 * Node-only dependencies (no bcrypt, no Prisma client).
 *
 * The Credentials provider lives in `lib/auth/index.ts`, which extends this
 * config in the Node runtime.
 *
 * SECURITY NOTE: never embed `approvalStatus` (or any other revocable state)
 * into the JWT — it would go stale. The session payload only carries
 * `id` and `role`. Sensitive actions re-fetch fresh DB state.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  callbacks: {
    /**
     * Coarse-grained route gate. Middleware runs this on every request to a
     * matched route; it's a lightweight signed-in check. Fine-grained role
     * routing also lives here so an authenticated user with the wrong role
     * is bounced before hitting the page.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;
      const path = nextUrl.pathname;

      const requiresStudent = path.startsWith("/student");
      const requiresCompany = path.startsWith("/company");
      const requiresAdmin = path.startsWith("/admin");

      if (requiresStudent || requiresCompany || requiresAdmin) {
        if (!isLoggedIn) return false;
        if (requiresStudent && role !== "STUDENT") {
          return Response.redirect(new URL("/", nextUrl));
        }
        if (requiresCompany && role !== "COMPANY") {
          return Response.redirect(new URL("/", nextUrl));
        }
        if (requiresAdmin && role !== "ADMIN") {
          return Response.redirect(new URL("/", nextUrl));
        }
      }

      return true;
    },
    /**
     * Persist `id` and `role` onto the JWT on first sign-in, then propagate
     * them on every subsequent token refresh.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    /**
     * Reflect token claims onto `session.user` so server components and
     * route handlers see `session.user.id` and `session.user.role`.
     */
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
  // Providers added in the Node-runtime entry (lib/auth/index.ts).
  providers: [],
} satisfies NextAuthConfig;
