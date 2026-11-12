import { MobileTopBar } from "@/components/layout/mobile-top-bar";
import { SampleDataBanner } from "@/components/layout/sample-data-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarFrame } from "@/components/layout/sidebar-frame";
import type { DocumentsDataSource } from "@/features/documents/services/documents-service";
import { SkipLink } from "@/components/layout/skip-link";

export function DashboardShell({
  children,
  initialCollapsed = false,
  displayName,
  dataSource,
  sampleBanner,
}: Readonly<{
  children: React.ReactNode;
  initialCollapsed?: boolean;
  displayName?: string | null;
  dataSource?: DocumentsDataSource;
  sampleBanner?: React.ReactNode;
}>) {
  const desktopSidebar = (
    <Sidebar
      id="sidebar-navigation"
      instanceId="desktop"
      displayName={displayName}
    />
  );
  const mobileSidebar = (
    <Sidebar
      id="mobile-sidebar-navigation"
      instanceId="mobile"
      displayName={displayName}
    />
  );
  const resolvedSampleBanner =
    sampleBanner ??
    (dataSource === "mock" ? <SampleDataBanner source="mock" /> : null);

  return (
    <div className="bg-canvas flex min-h-screen min-w-0">
      <SkipLink />
      <SidebarFrame initialCollapsed={initialCollapsed}>
        {desktopSidebar}
      </SidebarFrame>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar navigation={mobileSidebar} />
        {resolvedSampleBanner ? (
          <div className="border-hairline bg-surface border-b px-4 py-3 sm:px-6 lg:px-8">
            {resolvedSampleBanner}
          </div>
        ) : null}
        <main
          id="main-content"
          tabIndex={-1}
          className="bg-canvas min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
