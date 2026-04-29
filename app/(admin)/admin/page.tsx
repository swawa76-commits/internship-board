export const metadata = {
  title: "Admin dashboard",
};

export default function AdminDashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-12">
      <header className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Admin dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Marketplace metrics, moderation, and management tools live here.
        </p>
      </header>
    </main>
  );
}
