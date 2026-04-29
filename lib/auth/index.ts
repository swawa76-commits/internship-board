import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/lib/auth/config";
import { authenticateCredentials } from "@/lib/auth/credentials";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        return authenticateCredentials(parsed.data.email, parsed.data.password);
      },
    }),
  ],
});
