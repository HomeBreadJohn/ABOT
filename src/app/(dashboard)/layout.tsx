import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardLoading } from "@/components/shared/dashboard-loading";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  return <DashboardShell>{children}</DashboardShell>;
}
