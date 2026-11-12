"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/authentication/services/authenticate";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={isPending}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
