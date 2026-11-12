export default function DashboardLoading() {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse space-y-6"
      aria-label="Loading"
      role="status"
    >
      <h1 className="sr-only">Loading your workspace</h1>
      <div className="h-10 w-64 rounded-lg bg-slate-200" />
      <div className="h-24 rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 rounded-2xl bg-slate-200" />
        <div className="h-32 rounded-2xl bg-slate-200" />
        <div className="h-32 rounded-2xl bg-slate-200" />
      </div>
      <span className="sr-only">Loading your workspace</span>
    </div>
  );
}
