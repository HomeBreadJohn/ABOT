import { Sidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { RecentDocumentsNavSection } from "@/components/layout/recent-documents-nav";
import { SampleDataBanner } from "@/components/layout/sample-data-banner";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen">
      <a
        href="#main-content"
        className="focus:bg-brand-500 focus:text-ink-950 focus-visible:ring-brand-600 focus-visible:ring-offset-background sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Skip to main content
      </a>
      <Sidebar recent={<RecentDocumentsNavSection />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader recent={<RecentDocumentsNavSection />} />
        <SampleDataBanner />
        <main id="main-content" className="flex-1 px-4 py-10 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
