import Link from "next/link";

import { LoginForm } from "@/features/auth/login-form";

export const metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back to the internship marketplace.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            className="font-medium text-foreground hover:underline"
            href="/signup"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
