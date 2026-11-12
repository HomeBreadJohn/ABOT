"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  AUTHENTICATION_MESSAGES,
  AuthenticationError,
  signOut,
} from "@/features/authentication/services/authenticate";

function getSafeSignOutMessage(caughtError: unknown) {
  if (
    caughtError instanceof AuthenticationError &&
    caughtError.category === "sign_out_failed"
  ) {
    return AUTHENTICATION_MESSAGES.sign_out_failed;
  }

  return AUTHENTICATION_MESSAGES.sign_out_failed;
}

export function SignOutButton() {
  const router = useRouter();
  const activeControlRef = useRef<HTMLElement | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSignOut() {
    rememberActiveControl();
    setError(null);
    setIsPending(true);

    let shouldRestoreFocus = true;

    try {
      await signOut();
      shouldRestoreFocus = false;
      router.push("/login");
      router.refresh();
    } catch (caughtError) {
      setError(getSafeSignOutMessage(caughtError));
    } finally {
      setIsPending(false);
      if (shouldRestoreFocus) {
        restoreActiveControl();
      }
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        pending={isPending}
        pendingLabel="Signing out…"
        aria-describedby={error ? "sign-out-error" : undefined}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </Button>
      {isPending ? (
        <p className="sr-only" role="status" aria-live="polite">
          Signing you out…
        </p>
      ) : null}
      {error ? (
        <div
          id="sign-out-error"
          className="flex max-w-xs flex-wrap items-center justify-end gap-2 rounded-lg bg-rose-50 px-3 py-2 text-right text-sm text-rose-700"
          role="alert"
          aria-live="assertive"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSignOut}
            pending={isPending}
            pendingLabel="Retrying…"
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
