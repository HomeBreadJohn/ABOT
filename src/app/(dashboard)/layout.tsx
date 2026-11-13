import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardLoading } from "@/components/shared/dashboard-loading";
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

  return <DashboardShell>{children}</DashboardShell>;
}
