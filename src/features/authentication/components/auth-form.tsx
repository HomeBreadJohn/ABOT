"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTHENTICATION_MESSAGES,
  AuthenticationError,
  register,
  signIn,
} from "@/features/authentication/services/authenticate";

function getSafeAuthenticationMessage(caughtError: unknown) {
  if (caughtError instanceof AuthenticationError) {
    return AUTHENTICATION_MESSAGES[caughtError.category];
  }

  return AUTHENTICATION_MESSAGES.temporary_failure;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const activeControlRef = useRef<HTMLElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isRegister = mode === "register";

  function rememberActiveControl() {
    activeControlRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  function restoreActiveControl() {
    const activeControl = activeControlRef.current;

    if (!activeControl || !document.contains(activeControl)) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (
        document.contains(activeControl) &&
        !activeControl.matches(":disabled")
      ) {
        activeControl.focus();
      }
    });
  }

  function retrySubmission() {
    formRef.current?.requestSubmit();
  }

  function focusCorrectionControl() {
    emailInputRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    rememberActiveControl();
    setError(null);
    setMessage(null);
    setIsPending(true);

    let shouldRestoreFocus = true;

    try {
      if (isRegister) {
        await register({ email, password });
        setMessage(
          "Check your email to confirm your account before signing in.",
        );
      } else {
        await signIn({ email, password });
        shouldRestoreFocus = false;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (caughtError) {
      setError(getSafeAuthenticationMessage(caughtError));
    } finally {
      setIsPending(false);
      if (shouldRestoreFocus) {
        restoreActiveControl();
      }
    }
  }

  return (
    <div className="w-full max-w-md min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
      <div className="mb-8">
        <nav aria-label="Authentication navigation">
          <Link
            href="/"
            className="min-w-0 truncate rounded-sm text-sm font-semibold text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 focus-visible:outline-none"
          >
            {brand.name}
          </Link>
        </nav>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isRegister
            ? "Create a secure workspace for your documents."
            : "Sign in to continue to your document workspace."}
        </p>
      </div>
      <form
        ref={formRef}
        className="space-y-5"
        onSubmit={handleSubmit}
        aria-busy={isPending}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailInputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            pending={isPending}
            invalid={Boolean(error)}
            errorId={error ? "auth-error" : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            pending={isPending}
            invalid={Boolean(error)}
            errorId={error ? "auth-error" : undefined}
          />
        </div>
        {error ? (
          <div
            id="auth-error"
            className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800"
            role="alert"
            aria-live="assertive"
          >
            <p>{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={retrySubmission}
                disabled={isPending}
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={focusCorrectionControl}
                disabled={isPending}
              >
                Review details
              </Button>
            </div>
          </div>
        ) : null}
        {isPending ? (
          <p
            className="text-sm text-slate-500"
            role="status"
            aria-live="polite"
          >
            {isRegister ? "Creating your account…" : "Signing you in…"}
          </p>
        ) : null}
        {message ? (
          <p
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          pending={isPending}
          pendingLabel={isRegister ? "Creating account…" : "Signing in…"}
        >
          {isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          className="rounded-sm font-medium text-slate-950 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 focus-visible:outline-none"
          href={isRegister ? "/login" : "/register"}
        >
          {isRegister ? "Sign in" : "Register"}
        </Link>
      </p>
    </div>
  );
}
