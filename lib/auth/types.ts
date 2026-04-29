// Module augmentation for Auth.js v5 session and JWT shapes.
// Importing the modules anchors the augmentation so TypeScript resolves them.

import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/lib/db/generated/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}

export {};
