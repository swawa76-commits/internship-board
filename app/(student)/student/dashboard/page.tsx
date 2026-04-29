export const metadata = {
  title: "Student dashboard",
};

export default function StudentDashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Student dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Profile, applications, and saved postings live here.
        </p>
      </header>
    </main>
  );
}
