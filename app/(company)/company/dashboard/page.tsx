export const metadata = {
  title: "Company dashboard",
};

export default function CompanyDashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Company dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Profile, job postings, applicants, and messages live here.
        </p>
      </header>
    </main>
  );
}
