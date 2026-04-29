export const metadata = {
  title: "Browse internships",
};

export default function JobPostingsPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Internship job postings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Public listings will appear here once companies publish them.
        </p>
      </header>
    </main>
  );
}
