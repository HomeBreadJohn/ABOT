"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { ApiErrorCode } from "@/contracts/api-error";
import type { UploadPolicy } from "@/features/documents/upload/upload-policy";
import { validateFileForUpload } from "@/features/documents/upload/upload-helpers";
import {
  createUploadQueueState,
  uploadQueueReducer,
  type PreparedUpload,
  type UploadItem,
  type UploadPhase,
  type UploadQueueEvent,
} from "@/features/documents/upload/upload-queue";

import { putWithProgress } from "../upload/xhr-transport";

export type UploadActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ApiErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

export interface UploadPrepareInput {
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSize: number;
}

export interface UploadFinalizeInput extends UploadPrepareInput {
  readonly documentId: string;
}

export interface UploadDiscardInput {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
}

/** Server Actions are supplied by a Server Component and remain outside this client graph. */
export interface UploadComposerActions {
  prepare(
    input: UploadPrepareInput,
  ): Promise<UploadActionResult<PreparedUpload>>;
  finalize(
    input: UploadFinalizeInput,
  ): Promise<UploadActionResult<{ readonly document: unknown }>>;
  discard(input: UploadDiscardInput): Promise<UploadActionResult<null>>;
}

const MAX_BYTE_TRANSFERS = 3;

function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createItem(file: File, policy: UploadPolicy): UploadItem {
  const validation = validateFileForUpload(
    { name: file.name, type: file.type, size: file.size },
    policy,
  );
  const acceptedMimeType = validation.ok ? validation.mimeType : null;
  const displayName = validation.ok ? validation.originalFilename : file.name;

  return {
    id: globalThis.crypto.randomUUID(),
    file,
    fingerprint: fileFingerprint(file),
    displayName,
    mimeType: acceptedMimeType,
    prepared: null,
    phase: validation.ok
      ? { kind: "queued" }
      : { kind: "rejected", reason: validation.reason },
  };
}

function actionError(
  result: UploadActionResult<unknown>,
): Extract<UploadActionResult<unknown>, { ok: false }>['error'] | null {
  return result.ok ? null : result.error;
}

function uploadFailure(
  status: number | null,
): { code: ApiErrorCode; retryable: boolean } {
  if (status === 401) {
    return { code: "UNAUTHENTICATED", retryable: false };
  }

  if (status === 403) {
    return { code: "FORBIDDEN", retryable: false };
  }

  if (status === 404) {
    return { code: "NOT_FOUND", retryable: true };
  }

  if (status === 415) {
    return { code: "UNSUPPORTED_FILE", retryable: false };
  }

  if (status === 429) {
    return { code: "RATE_LIMITED", retryable: true };
  }

  if (status !== null && status >= 500) {
    return { code: "PROVIDER_UNAVAILABLE", retryable: true };
  }

  return { code: "INVALID_REQUEST", retryable: false };
}

function isTicketValid(prepared: PreparedUpload | null): boolean {
  return (
    prepared?.transport === "signed-url" &&
    Number.isFinite(prepared.expiresAt) &&
    prepared.expiresAt > Date.now()
  );
}

function inputForItem(item: UploadItem): UploadPrepareInput {
  return {
    originalFilename: item.displayName,
    mimeType: item.mimeType ?? item.file.type,
    fileSize: item.file.size,
  };
}

function failureStep(phase: UploadPhase): "prepare" | "upload" | "finalize" | null {
  if (phase.kind === "preparing") {
    return "prepare";
  }

  if (phase.kind === "uploading") {
    return "upload";
  }

  if (phase.kind === "finalizing") {
    return "finalize";
  }

  return null;
}

export function useUploadQueue(
  policy: UploadPolicy,
  actions: UploadComposerActions,
): {
  items: readonly UploadItem[];
  addFiles(files: FileList | readonly File[]): void;
  start(): void;
  retry(itemId: string): void;
  remove(itemId: string): void;
  announcement: string;
  isBusy: boolean;
} {
  const router = useRouter();
  const [state, reduce] = React.useReducer(
    uploadQueueReducer,
    policy,
    createUploadQueueState,
  );
  const stateRef = React.useRef(state);
  const actionsRef = React.useRef(actions);
  const actionTail = React.useRef(Promise.resolve());
  const activeControllers = React.useRef(new Map<string, AbortController>());
  const runningItems = React.useRef(new Set<string>());
  const batchRunning = React.useRef(false);
  const [announcement, setAnnouncement] = React.useState("");

  React.useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const dispatch = React.useCallback((event: UploadQueueEvent) => {
    stateRef.current = uploadQueueReducer(stateRef.current, event);
    reduce(event);
  }, []);

  const announce = React.useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const serializeAction = React.useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const previous = actionTail.current;
      const current = previous.catch(() => undefined).then(operation);
      actionTail.current = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
    [],
  );

  const processItem = React.useCallback(
    async (itemId: string): Promise<void> => {
      if (runningItems.current.has(itemId)) {
        return;
      }

      runningItems.current.add(itemId);

      try {
        let item = stateRef.current.items.find((candidate) => candidate.id === itemId);
        if (!item || item.phase.kind === "rejected" || item.phase.kind === "done") {
          return;
        }

        if (item.phase.kind === "queued") {
          dispatch({ type: "START", itemId });
          item = stateRef.current.items.find((candidate) => candidate.id === itemId);
          if (!item) {
            return;
          }
        }

        if (item.phase.kind === "preparing") {
          const input = inputForItem(item);
          let preparedResult: UploadActionResult<PreparedUpload>;

          try {
            preparedResult = await serializeAction(() =>
              actionsRef.current.prepare(input),
            );
          } catch {
            dispatch({
              type: "FAIL",
              itemId,
              step: "prepare",
              code: "INTERNAL_ERROR",
              retryable: true,
            });
            return;
          }

          if (!stateRef.current.items.some((candidate) => candidate.id === itemId)) {
            if (preparedResult.ok) {
              await serializeAction(() =>
                actionsRef.current.discard({
                  ...input,
                  documentId: preparedResult.data.documentId,
                }),
              ).catch(() => undefined);
            }
            return;
          }

          if (!preparedResult.ok) {
            dispatch({
              type: "FAIL",
              itemId,
              step: "prepare",
              code: preparedResult.error.code,
              retryable: preparedResult.error.retryable,
            });
            announce(`${item.displayName}: upload needs attention.`);
            return;
          }

          dispatch({
            type: "PREPARED",
            itemId,
            prepared: preparedResult.data,
          });
          item = stateRef.current.items.find((candidate) => candidate.id === itemId);
          if (!item) {
            return;
          }
        }

        if (item.phase.kind === "uploading") {
          const prepared = item.prepared;
          if (!prepared || prepared.transport !== "signed-url") {
            dispatch({
              type: "FAIL",
              itemId,
              step: "upload",
              code: "INTERNAL_ERROR",
              retryable: true,
            });
            return;
          }

          const controller = new AbortController();
          activeControllers.current.set(itemId, controller);
          announce(`${item.displayName}: uploading.`);

          const result = await putWithProgress(
            prepared.signedUrl,
            item.file,
            (loaded, total) =>
              dispatch({ type: "PROGRESS", itemId, loaded, total }),
            controller.signal,
          );
          activeControllers.current.delete(itemId);

          if (!result.ok) {
            const { reason, status } = result;

            if (reason === "aborted") {
              return;
            }

            if (status === 409) {
              dispatch({ type: "UPLOADED", itemId });
            } else {
              const failure =
                reason === "network"
                  ? { code: "NETWORK" as const, retryable: true }
                  : uploadFailure(status);
              dispatch({
                type: "FAIL",
                itemId,
                step: "upload",
                code: failure.code,
                retryable: failure.retryable,
              });
              announce(`${item.displayName}: upload needs attention.`);
              return;
            }
          } else {
            dispatch({ type: "UPLOADED", itemId });
          }

          item = stateRef.current.items.find((candidate) => candidate.id === itemId);
          if (!item) {
            return;
          }
        }

        if (item.phase.kind !== "finalizing" || !item.prepared) {
          return;
        }

        const input = inputForItem(item);
        const finalizeInput: UploadFinalizeInput = {
          ...input,
          documentId: item.prepared.documentId,
        };
        let finalizedResult: UploadActionResult<{ readonly document: unknown }>;

        try {
          finalizedResult = await serializeAction(() =>
            actionsRef.current.finalize(finalizeInput),
          );
        } catch {
          dispatch({
            type: "FAIL",
            itemId,
            step: "finalize",
            code: "INTERNAL_ERROR",
            retryable: true,
          });
          return;
        }

        const finalizeFailure = actionError(finalizedResult);
        if (finalizeFailure) {
          dispatch({
            type: "FAIL",
            itemId,
            step: "finalize",
            code: finalizeFailure.code,
            retryable: finalizeFailure.retryable,
          });
          announce(`${item.displayName}: upload needs attention.`);
          return;
        }

        if (!stateRef.current.items.some((candidate) => candidate.id === itemId)) {
          return;
        }

        dispatch({
          type: "FINALIZED",
          itemId,
          documentId: item.prepared.documentId,
        });
        announce(`${item.displayName}: received.`);
      } catch {
        const item = stateRef.current.items.find((candidate) => candidate.id === itemId);
        const step = item ? failureStep(item.phase) : null;
        if (step) {
          dispatch({
            type: "FAIL",
            itemId,
            step,
            code: "INTERNAL_ERROR",
            retryable: true,
          });
        }
      } finally {
        activeControllers.current.delete(itemId);
        runningItems.current.delete(itemId);
      }
    },
    [announce, dispatch, serializeAction],
  );

  const runBatch = React.useCallback(
    async (itemIds: readonly string[]) => {
      if (batchRunning.current || itemIds.length === 0) {
        return;
      }

      batchRunning.current = true;
      let nextIndex = 0;
      const workerCount = Math.min(MAX_BYTE_TRANSFERS, itemIds.length);

      const worker = async () => {
        while (nextIndex < itemIds.length) {
          const itemId = itemIds[nextIndex];
          nextIndex += 1;
          await processItem(itemId);
        }
      };

      try {
        await Promise.all(
          Array.from({ length: workerCount }, () => worker()),
        );
      } finally {
        batchRunning.current = false;
        router.refresh();
      }
    },
    [processItem, router],
  );

  const addFiles = React.useCallback(
    (files: FileList | readonly File[]) => {
      for (const file of Array.from(files)) {
        dispatch({ type: "ADD", item: createItem(file, policy) });
      }
    },
    [dispatch, policy],
  );

  const start = React.useCallback(() => {
    if (batchRunning.current) {
      return;
    }

    const itemIds = stateRef.current.items
      .filter((item) => item.phase.kind === "queued")
      .map((item) => item.id);
    void runBatch(itemIds);
  }, [runBatch]);

  const retry = React.useCallback(
    (itemId: string) => {
      if (batchRunning.current) {
        return;
      }

      const item = stateRef.current.items.find((candidate) => candidate.id === itemId);
      if (!item || item.phase.kind !== "failed" || !item.phase.retryable) {
        return;
      }

      const ticketValid = item.phase.step === "upload" && isTicketValid(item.prepared);
      dispatch({ type: "RETRY", itemId, ticketValid });
      void runBatch([itemId]);
    },
    [dispatch, runBatch],
  );

  const remove = React.useCallback(
    (itemId: string) => {
      const item = stateRef.current.items.find((candidate) => candidate.id === itemId);
      if (!item) {
        return;
      }

      activeControllers.current.get(itemId)?.abort();
      activeControllers.current.delete(itemId);
      dispatch({ type: "REMOVE", itemId });

      if (item.prepared && item.phase.kind !== "done") {
        const input = inputForItem(item);
        void serializeAction(() =>
          actionsRef.current.discard({
            ...input,
            documentId: item.prepared?.documentId ?? "",
          }),
        ).catch(() => undefined);
      }
    },
    [dispatch, serializeAction],
  );

  const isBusy = state.items.some((item) =>
    ["preparing", "uploading", "finalizing"].includes(item.phase.kind),
  );

  return {
    items: state.items,
    addFiles,
    start,
    retry,
    remove,
    announcement,
    isBusy,
  };
}
