"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CATEGORY_FILTERS,
  CATEGORY_LABELS,
  serializeVaultQuery,
  VAULT_SORTS,
  VAULT_STATUS_FILTERS,
  type CategoryFilterValue,
  type VaultQuery,
  type VaultSort,
  type VaultStatusFilter,
} from "@/features/documents/schemas/vault-query";

const sortLabels: Readonly<Record<VaultSort, string>> = {
  newest: "Newest",
  oldest: "Oldest",
  next_date: "Next date",
  title: "Title",
  attention: "Attention",
};

const statusLabels: Readonly<Record<VaultStatusFilter, string>> = {
  all: "All",
  attention: "Needs attention",
  in_progress: "In progress",
  ready: "Ready",
};

function categoryLabel(category: CategoryFilterValue): string {
  if (category === "all") return "All";
  if (category === "unsorted") return "Not yet sorted";
  return CATEGORY_LABELS[category];
}

function VaultToolbar({ query }: { query: VaultQuery }) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const searchTimeout = useRef<number | null>(null);
  const queryRef = useRef(query);

  const replaceQuery = useCallback(
    (nextQuery: VaultQuery) => {
      const serialized = serializeVaultQuery(nextQuery);
      const href = serialized ? `${pathname}?${serialized}` : pathname;

      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router, startTransition],
  );

  function clearSearchTimeout() {
    if (searchTimeout.current !== null) {
      window.clearTimeout(searchTimeout.current);
      searchTimeout.current = null;
    }
  }

  useEffect(() => {
    queryRef.current = query;
    return clearSearchTimeout;
  }, [query]);

  function handleSearchChange(value: string) {
    clearSearchTimeout();
    searchTimeout.current = window.setTimeout(() => {
      searchTimeout.current = null;
      replaceQuery({ ...queryRef.current, q: value });
    }, 300);
  }

  return (
    <div
      aria-label="Document filters"
      className="bg-surface border-hairline grid gap-3 rounded-xl border p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(9rem,12rem))]"
      role="search"
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="document-search" className="sr-only">
          Search your documents
        </label>
        <Input
          key={query.q}
          id="document-search"
          type="search"
          defaultValue={query.q}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search your documents"
          autoComplete="off"
        />
      </div>

      <Select
        id="document-category"
        label="Category"
        value={query.category}
        onChange={(event) => {
          clearSearchTimeout();
          replaceQuery({
            ...query,
            category: event.target.value as CategoryFilterValue,
          });
        }}
      >
        {CATEGORY_FILTERS.map((category) => (
          <option key={category} value={category}>
            {categoryLabel(category)}
          </option>
        ))}
      </Select>

      <Select
        id="document-status"
        label="Status"
        value={query.status}
        onChange={(event) => {
          clearSearchTimeout();
          replaceQuery({
            ...query,
            status: event.target.value as VaultStatusFilter,
          });
        }}
      >
        {VAULT_STATUS_FILTERS.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </Select>

      <Select
        id="document-sort"
        label="Sort"
        value={query.sort}
        onChange={(event) => {
          clearSearchTimeout();
          replaceQuery({
            ...query,
            sort: event.target.value as VaultSort,
          });
        }}
      >
        {VAULT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {sortLabels[sort]}
          </option>
        ))}
      </Select>
    </div>
  );
}

export { VaultToolbar };
