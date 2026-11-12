import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  SIDEBAR_STATE_COOKIE_NAME,
  parseSidebarState,
} from "@/components/layout/sidebar-state";
import { DashboardLoading } from "@/components/shared/dashboard-loading";
import { getCurrentDisplayName } from "@/features/profile/services/profile-service";
import { getDocumentsService } from "@/features/documents/services";
import { getServerAuthState } from "@/lib/supabase/server";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}

async function AuthenticatedDashboard({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { claims, hasSessionCookie } = await getServerAuthState();

  if (!claims) {
    redirect(hasSessionCookie ? "/login?reason=session-expired" : "/login");
  }

  const sidebarState = parseSidebarState(
    (await cookies()).get(SIDEBAR_STATE_COOKIE_NAME)?.value,
  );
  const [displayName, documentsService] = await Promise.all([
    getCurrentDisplayName(),
    getDocumentsService(),
  ]);

  return (
    <DashboardShell
      initialCollapsed={sidebarState === "collapsed"}
      displayName={displayName}
      dataSource={documentsService.source}
    >
      {children}
    </DashboardShell>
  );
}
