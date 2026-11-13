/**
 * Decides whether a page can be shown. Pages listed in
 * `analysisMetadata.unavailablePages` are never fetched, and a fetched page
 * whose status is FAILED is treated the same way.
 */
export function isPageUnavailable(
  pageNumber: number,
  unavailablePages: readonly number[] | undefined,
): boolean {
  return unavailablePages?.includes(pageNumber) ?? false;
}

export function isPageUnreadable(
  pageNumber: number,
  unavailablePages: readonly number[] | undefined,
  fetchedStatus?: "READY" | "FAILED",
): boolean {
  return (
    isPageUnavailable(pageNumber, unavailablePages) ||
    fetchedStatus === "FAILED"
  );
}

/** Previous page number, or null at the first page. */
export function previousPage(pageNumber: number): number | null {
  return pageNumber > 1 ? pageNumber - 1 : null;
}

/**
 * Next page number, or null when `pageCount` is known and this is the last
 * page. When `pageCount` is unknown the next page is always offered; a missing
 * page then shows the safe not-found message.
 */
export function nextPage(
  pageNumber: number,
  pageCount?: number,
): number | null {
  if (pageCount !== undefined && pageNumber >= pageCount) return null;
  return pageNumber + 1;
}
