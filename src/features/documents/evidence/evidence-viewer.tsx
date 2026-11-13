"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PresentationValue } from "@/components/ui/presentation-value";
import type { EvidenceReference } from "@/contracts";
import { getPage } from "@/lib/api-client/analysis";
import { safeMessageFor } from "@/lib/api-client/safe-messages";
import { useApiError } from "@/lib/api-client/use-api-error";
import {
  computeHighlight,
  highlightNotice,
} from "@/features/documents/evidence/compute-highlight";
import {
  averageConfidenceLabel,
  summarizeConfidence,
} from "@/features/documents/evidence/confidence-cue";
import { EvidencePageText } from "@/features/documents/evidence/evidence-page-text";
import {
  getDocumentSignedUrl,
  openOriginalFile,
  type SignedUrlResponse,
} from "@/features/documents/evidence/open-original-file";
import {
  isPageUnavailable,
  nextPage,
  previousPage,
} from "@/features/documents/evidence/page-availability";

type DocumentPage = Awaited<ReturnType<typeof getPage>>;

export interface EvidenceViewerProps {
  documentId: string;
  /** The evidence to show. Nothing renders while this is null. */
  evidence: EvidenceReference | null;
  /** `analysis.analysisMetadata.unavailablePages`. These pages are never fetched. */
  unavailablePages?: readonly number[];
  /** Total pages when known, so "Next page" is disabled on the last one. */
  pageCount?: number;
  open: boolean;
  onClose: () => void;
  /**
   * Element that receives focus when the dialog closes. Defaults to whatever
   * had focus when it opened. Pass this when the opener may unmount.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Injectable for tests. Defaults to `getPage` from the api-client. */
  fetchPage?: (documentId: string, pageNumber: number) => Promise<DocumentPage>;
  /** Injectable for tests. Defaults to the signed-url route wrapper. */
  fetchSignedUrl?: (documentId: string) => Promise<SignedUrlResponse>;
}

const SOURCE_LABELS: Record<EvidenceReference["sourceType"], string> = {
  OCR_TEXT: "OCR text",
  USER_CORRECTION: "Your correction",
};

const BLOCKED_TAB_MESSAGE =
  "Your browser blocked the new tab. Allow pop-ups for this site and try again.";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function EvidenceViewer(props: EvidenceViewerProps) {
  if (!props.open || props.evidence === null) return null;
  // Keyed by evidence so each opening starts on the cited page.
  return (
    <EvidenceViewerDialog
      key={props.evidence.id}
      {...props}
      evidence={props.evidence}
    />
  );
}

type PageResult =
  | { key: string; page: DocumentPage; errorMessage?: undefined }
  | { key: string; page?: undefined; errorMessage: string };

function EvidenceViewerDialog({
  documentId,
  evidence,
  unavailablePages,
  pageCount,
  onClose,
  returnFocusRef,
  fetchPage = getPage,
  fetchSignedUrl = getDocumentSignedUrl,
}: EvidenceViewerProps & { evidence: EvidenceReference }) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const citedRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const fetchPageRef = useRef(fetchPage);

  const [pageNumber, setPageNumber] = useState(evidence.pageNumber);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PageResult | null>(null);
  const [opening, setOpening] = useState(false);
  const [tabBlocked, setTabBlocked] = useState(false);
  const openError = useApiError();

  useEffect(() => {
    onCloseRef.current = onClose;
    fetchPageRef.current = fetchPage;
  });

  // Focus trap, Escape, scroll lock, and focus return to the opener.
  useEffect(() => {
    const opener =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof Node) || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [returnFocusRef]);

  const pageUnavailable = isPageUnavailable(pageNumber, unavailablePages);
  const requestKey = `${documentId}|${pageNumber}|${attempt}`;

  useEffect(() => {
    if (pageUnavailable) return;
    let cancelled = false;
    fetchPageRef
      .current(documentId, pageNumber)
      .then((page) => {
        if (!cancelled) setResult({ key: requestKey, page });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({ key: requestKey, errorMessage: safeMessageFor(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, pageNumber, pageUnavailable, requestKey]);

  // Loading is derived: a result only counts when it answers the current request.
  const current = result?.key === requestKey ? result : null;
  const loading = !pageUnavailable && current === null;
  const page = current?.page;
  const unreadable = pageUnavailable || page?.status === "FAILED";
  const showsCitedPage = pageNumber === evidence.pageNumber;

  const highlight = useMemo(
    () =>
      computeHighlight(
        showsCitedPage ? evidence : {},
        page?.status === "READY" ? page.words : [],
      ),
    [evidence, showsCitedPage, page],
  );
  const notice =
    showsCitedPage && page?.status === "READY" && page.words.length > 0
      ? highlightNotice(highlight)
      : null;
  const confidence = useMemo(
    () => (page?.status === "READY" ? summarizeConfidence(page.words) : null),
    [page],
  );

  useEffect(() => {
    if (highlight.kind === "range") {
      citedRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [highlight, page]);

  async function handleOpenOriginal() {
    if (opening) return;
    setOpening(true);
    setTabBlocked(false);
    openError.clear();
    try {
      const outcome = await openOriginalFile(documentId, {
        fetchSignedUrl,
        openTab: (url, target) => window.open(url, target),
      });
      if (outcome === "blocked") setTabBlocked(true);
    } catch (error) {
      openError.set(error);
    } finally {
      setOpening(false);
    }
  }

  const previous = previousPage(pageNumber);
  const next = nextPage(pageNumber, pageCount);
  const hasRange =
    evidence.wordStart !== undefined && evidence.wordEnd !== undefined;

  return (
    <div
      className="bg-ink-950/50 fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="bg-surface text-ink border-ink-200 shadow-soft flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border focus:outline-none sm:rounded-xl"
      >
        <div className="border-hairline flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-subhead text-ink font-semibold">
              Evidence on page {pageNumber}
            </h2>
            <p id={descriptionId} className="text-body-sm text-ink-muted mt-1">
              {showsCitedPage
                ? "The part of your document this answer is based on."
                : `You are viewing a different page. The evidence is on page ${evidence.pageNumber}.`}
            </p>
          </div>
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-4">
          <section aria-labelledby={`${titleId}-cited`}>
            <h3
              id={`${titleId}-cited`}
              className="text-caption text-ink-subtle font-semibold tracking-wide uppercase"
            >
              Cited passage
            </h3>
            <blockquote className="text-ink border-strong mt-2 border-l-2 pl-3 leading-relaxed break-words italic">
              {evidence.excerpt}
            </blockquote>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <PresentationValue
                presentation={{
                  label: SOURCE_LABELS[evidence.sourceType],
                  cue:
                    evidence.sourceType === "USER_CORRECTION"
                      ? "\u270E"
                      : "\u00B6",
                  tone:
                    evidence.sourceType === "USER_CORRECTION"
                      ? "informative"
                      : "neutral",
                  supported: true,
                }}
              />
              <p className="text-caption text-ink-subtle tabular-nums">
                Page {evidence.pageNumber}
                {hasRange
                  ? ` · words ${evidence.wordStart}\u2013${evidence.wordEnd}`
                  : ""}
              </p>
            </div>
          </section>

          <section aria-labelledby={`${titleId}-page`} className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3
                id={`${titleId}-page`}
                className="text-caption text-ink-subtle font-semibold tracking-wide uppercase"
              >
                Page {pageNumber} text
              </h3>
              {page?.status === "READY" ? (
                <p className="text-caption text-ink-subtle">
                  Average reading confidence:{" "}
                  <span className="text-ink font-medium">
                    {averageConfidenceLabel(page.averageConfidence)}
                  </span>
                </p>
              ) : null}
            </div>

            {loading ? (
              <p role="status" className="text-body-sm text-ink-muted">
                Loading page {pageNumber}…
              </p>
            ) : null}

            {current?.errorMessage !== undefined ? (
              <div
                role="alert"
                className="border-tone-critical-border bg-tone-critical-bg rounded-md border p-3.5"
              >
                <p className="text-body-sm text-ink">{current.errorMessage}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="mt-3"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : null}

            {unreadable ? (
              <div
                role="status"
                className="border-tone-caution-border bg-tone-caution-bg rounded-md border p-3.5"
              >
                <p className="text-body-sm text-ink font-semibold">
                  This page could not be read.
                </p>
                <p className="text-body-sm text-ink-muted mt-1">
                  We could not read the text on page {pageNumber}, so it cannot
                  be shown here. The quoted excerpt above is all we have. You
                  can still open your original file.
                </p>
              </div>
            ) : null}

            {page?.status === "READY" ? (
              <>
                <ul
                  aria-label="Legend"
                  className="text-caption text-ink-muted grid gap-1.5"
                >
                  <li>
                    <mark className="bg-brand-100 text-ink-950 outline-brand-700 rounded-sm px-0.5 outline-2 outline-offset-1">
                      Shaded box
                    </mark>{" "}
                    marks the cited passage.
                  </li>
                  <li>
                    <span className="underline decoration-dotted decoration-2 underline-offset-4">
                      Dotted underline
                      <sup aria-hidden="true" className="font-semibold">
                        ?
                      </sup>
                    </span>{" "}
                    marks a word the reader was unsure of. Check it against your
                    original file.
                  </li>
                </ul>

                {confidence ? (
                  <p className="text-caption text-ink-subtle">
                    {confidence.low > 0
                      ? `${confidence.low} of ${confidence.total} words are low confidence.`
                      : "No words on this page are low confidence."}
                    {confidence.unknown > 0
                      ? ` Confidence is not available for ${confidence.unknown} ${confidence.unknown === 1 ? "word" : "words"}.`
                      : ""}
                  </p>
                ) : null}

                {notice ? (
                  <p role="status" className="text-body-sm text-ink-muted">
                    {notice}
                  </p>
                ) : null}

                <div
                  role="region"
                  aria-label={`Text of page ${pageNumber}`}
                  tabIndex={0}
                  className="border-hairline bg-surface-sunken max-h-72 overflow-y-auto rounded-md border p-3.5 leading-relaxed"
                >
                  {page.words.length > 0 ? (
                    <EvidencePageText
                      words={page.words}
                      highlight={highlight}
                      citedRef={citedRef}
                    />
                  ) : page.text.trim() !== "" ? (
                    <p className="text-body text-ink break-words whitespace-pre-wrap">
                      {page.text}
                    </p>
                  ) : (
                    <p className="text-body-sm text-ink-muted">
                      No text was found on this page.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </section>

          {openError.message !== null ? (
            <p role="alert" className="text-body-sm text-ink">
              {openError.message}
            </p>
          ) : null}
          {tabBlocked ? (
            <p role="alert" className="text-body-sm text-ink">
              {BLOCKED_TAB_MESSAGE}
            </p>
          ) : null}
        </div>

        <div className="border-hairline flex flex-wrap items-center gap-2 border-t p-4">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={previous === null}
            aria-label={
              previous === null
                ? "Previous page"
                : `Previous page, page ${previous}`
            }
            onClick={() => previous !== null && setPageNumber(previous)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={next === null}
            aria-label={next === null ? "Next page" : `Next page, page ${next}`}
            onClick={() => next !== null && setPageNumber(next)}
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="sm:ml-auto"
            disabled={opening}
            onClick={handleOpenOriginal}
          >
            Open original file
            <span className="sr-only"> (opens in a new tab)</span>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
