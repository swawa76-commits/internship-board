import Link from "next/link";

import { SignupForm } from "@/features/auth/signup-form";

export const metadata = {
  title: "Create an account",
};

export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create an account
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign up as a student or a company.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-foreground hover:underline" href="/login">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
