import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6"
      aria-label="Loading your workspace"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <h1 className="sr-only">Loading your workspace</h1>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <p className="sr-only">Loading your workspace</p>
    </div>
  );
}
