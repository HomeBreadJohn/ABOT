export function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div
        className="w-full max-w-xl animate-pulse space-y-4"
        aria-label="Loading"
        role="status"
      >
        <h1 className="sr-only">Loading your workspace</h1>
        <div className="h-8 w-56 rounded-lg bg-slate-200" />
        <div className="h-28 rounded-2xl bg-slate-200" />
        <span className="sr-only">Loading your workspace</span>
      </div>
    </main>
  );
}
