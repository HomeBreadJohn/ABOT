import { Suspense } from "react";

import { AuthForm } from "@/features/authentication/components/auth-form";

type LoginPageProps = {
  searchParams?: Promise<{
    reason?: string | string[];
  }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <main className="w-full min-w-0">
      <Suspense fallback={<AuthForm mode="login" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const showSessionExpiredMessage = params?.reason === "session-expired";

  return (
    <>
      {showSessionExpiredMessage ? (
        <p
          className="mx-auto mb-4 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          role="status"
          aria-live="polite"
        >
          Your session ended. Sign in again to continue.
        </p>
      ) : null}
      <AuthForm mode="login" />
    </>
  );
}
