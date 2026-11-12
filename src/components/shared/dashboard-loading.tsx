export function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div
        className="w-full max-w-xl animate-pulse space-y-4"
        aria-label="Loading"
        role="status"
      >
        <div className="h-8 w-56 rounded-lg bg-ink-200" />
        <div className="h-28 rounded-2xl bg-ink-200" />
        <span className="sr-only">Loading your workspace</span>
      </div>
    </div>
  );
}
