"use client";

import { useCallback, useMemo, useState } from "react";

import type { ApiErrorCode } from "@/contracts";
import { safeCodeFor, SAFE_API_MESSAGES } from "@/lib/api-client/safe-messages";

export interface UseApiError {
  /** Fixed safe copy for the current error, or null when there is none. */
  readonly message: string | null;
  readonly code: ApiErrorCode | null;
  /** Records a thrown value. Only the mapped code is kept, never its message. */
  set(error: unknown): void;
  clear(): void;
}

export function useApiError(): UseApiError {
  const [code, setCode] = useState<ApiErrorCode | null>(null);

  const set = useCallback((error: unknown) => setCode(safeCodeFor(error)), []);
  const clear = useCallback(() => setCode(null), []);

  return useMemo(
    () => ({
      message: code === null ? null : SAFE_API_MESSAGES[code],
      code,
      set,
      clear,
    }),
    [code, set, clear],
  );
}
