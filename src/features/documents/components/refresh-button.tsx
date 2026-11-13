"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending) {
      setAnnouncement("Updated");
    }
    wasPending.current = isPending;
  }, [isPending]);

  function refresh() {
    setAnnouncement("Checking for updates");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="ghost"
        onClick={refresh}
        disabled={isPending}
      >
        {isPending ? (
          "Checking…"
        ) : (
          <>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Check for updates
          </>
        )}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

export { RefreshButton };
