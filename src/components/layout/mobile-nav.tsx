"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const mobileNavigationDialogId = "mobile-navigation-dialog";

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function MobileNav({
  children,
}: Readonly<{
  children?: React.ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const wasOpenRef = useRef(false);

  function closeNavigation() {
    setOpen(false);
  }

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      closeNavigation();
    }
  }, [pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open) {
      wasOpenRef.current = true;

      if (!dialog.open) {
        dialog.showModal();
      }

      const frame = window.requestAnimationFrame(() => {
        getFocusableElements(dialog)[0]?.focus();
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (dialog.open) {
      dialog.close();
    }

    if (!wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(event.currentTarget);
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-standard hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-controls={mobileNavigationDialogId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      <dialog
        ref={dialogRef}
        id={mobileNavigationDialogId}
        aria-label="Mobile navigation"
        className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-ink/30"
        onCancel={(event) => {
          event.preventDefault();
          closeNavigation();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeNavigation();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto bg-surface-sunken shadow-raised">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
            <span className="font-semibold tracking-tight text-ink">Menu</span>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-standard hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
              aria-label="Close navigation"
              onClick={closeNavigation}
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </dialog>
    </>
  );
}
