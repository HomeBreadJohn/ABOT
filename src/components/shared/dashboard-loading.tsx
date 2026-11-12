import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <main
      className="bg-canvas flex min-h-screen items-center justify-center px-6"
      aria-label="Loading your workspace"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-xl space-y-4">
        <h1 className="sr-only">Loading your workspace</h1>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28" />
        <p className="sr-only">Loading your workspace</p>
      </div>
    </main>
  );
}
