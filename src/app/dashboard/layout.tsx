import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getServerAuthState } from "@/lib/supabase/server";

import "../prototype/proto.css";

const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
});
const ocr = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"],
  variable: "--font-ocr",
});

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`proto ${body.variable} ${ocr.variable}`}>
      <Suspense fallback={null}>
        <AuthenticatedApp>{children}</AuthenticatedApp>
      </Suspense>
    </div>
  );
}

async function AuthenticatedApp({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { claims, hasSessionCookie } = await getServerAuthState();

  if (!claims) {
    redirect(hasSessionCookie ? "/login?reason=session-expired" : "/login");
  }

  return <>{children}</>;
}
