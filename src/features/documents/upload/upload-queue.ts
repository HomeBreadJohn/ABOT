import type { ApiErrorCode } from "@/contracts/api-error";

import type {
  AllowedMimeType,
  UploadPolicy,
} from "./upload-policy";
import type { FileRejectionReason } from "./upload-helpers";

export type PreparedUpload =
  | {
      readonly transport: "signed-url";
      readonly documentId: string;
      readonly signedUrl: string;
      readonly expiresAt: number;
    }
  | { readonly transport: "mock"; readonly documentId: string };

/**
 * The client-side lifecycle for one upload.
 *
 * Byte progress exists only while bytes are uploading. Preparing and
 * finalizing are processing states without an invented percentage, and this
 * queue deliberately has no OCR or analysis progress state.
 */
export type UploadPhase =
  | { readonly kind: "rejected"; readonly reason: FileRejectionReason }
  | { readonly kind: "queued" }
  | { readonly kind: "preparing" }
  | {
      readonly kind: "uploading";
      readonly loaded: number;
      readonly total: number | null;
    }
  | { readonly kind: "finalizing" }
  | { readonly kind: "done"; readonly documentId: string }
  | {
      readonly kind: "failed";
      readonly step: "prepare" | "upload" | "finalize";
      readonly code: ApiErrorCode | "NETWORK";
      readonly retryable: boolean;
    };

export interface UploadItem {
  readonly id: string;
  /** The browser file stays in client memory and is never sent in an action. */
  readonly file: File;
  /** `${name}:${size}:${lastModified}`; used for queue-local duplicate checks. */
  readonly fingerprint: string;
  readonly displayName: string;
  readonly mimeType: AllowedMimeType | null;
  /** Reused when a retry does not need a new prepare request. */
  readonly prepared: PreparedUpload | null;
  readonly phase: UploadPhase;
}

export interface UploadQueueState {
  readonly policy: UploadPolicy;
  readonly items: readonly UploadItem[];
}

export type UploadQueueEvent =
  | { readonly type: "ADD"; readonly item: UploadItem }
  | { readonly type: "START"; readonly itemId: string }
  | {
      readonly type: "PREPARED";
      readonly itemId: string;
      readonly prepared: PreparedUpload;
    }
  | {
      readonly type: "PROGRESS";
      readonly itemId: string;
      readonly loaded: number;
      readonly total: number | null;
    }
  | { readonly type: "UPLOADED"; readonly itemId: string }
  | {
      readonly type: "FINALIZED";
      readonly itemId: string;
      readonly documentId: string;
    }
  | {
      readonly type: "FAIL";
      readonly itemId: string;
      readonly step: "prepare" | "upload" | "finalize";
      readonly code: ApiErrorCode | "NETWORK";
      readonly retryable: boolean;
    }
  | {
      readonly type: "RETRY";
      readonly itemId: string;
      /** False or omitted means a new prepare request is required. */
      readonly ticketValid?: boolean;
    }
  | { readonly type: "REMOVE"; readonly itemId: string };

/** Creates an empty immutable queue for the selected upload policy. */
export function createUploadQueueState(policy: UploadPolicy): UploadQueueState {
  return { policy, items: [] };
}

/**
 * Returns the honest byte-upload percentage for a phase.
 *
 * Processing phases intentionally return null. A percentage is available only
 * when the browser supplied a positive total, so OCR/analysis progress cannot
 * be implied by the upload queue.
 */
export function getUploadProgressPercentage(
  phase: UploadPhase,
): number | null {
  if (phase.kind !== "uploading" || phase.total === null || phase.total <= 0) {
    return null;
  }

  return Math.floor((phase.loaded / phase.total) * 100);
}

function replaceItem(
  state: UploadQueueState,
  index: number,
  item: UploadItem,
): UploadQueueState {
  const items = state.items.slice();
  items[index] = item;
  return { ...state, items };
}

function updateItem(
  state: UploadQueueState,
  index: number,
  phase: UploadPhase,
  prepared = state.items[index]?.prepared ?? null,
): UploadQueueState {
  const current = state.items[index];
  if (!current) {
    return state;
  }

  return replaceItem(state, index, { ...current, phase, prepared });
}

function findItemIndex(
  state: UploadQueueState,
  itemId: string,
): number {
  return state.items.findIndex((item) => item.id === itemId);
}

function isNonRejected(item: UploadItem): boolean {
  return item.phase.kind !== "rejected";
}

function rejectionItem(
  item: UploadItem,
  reason: FileRejectionReason,
): UploadItem {
  return {
    ...item,
    prepared: null,
    phase: { kind: "rejected", reason },
  };
}

function addItem(
  state: UploadQueueState,
  incoming: UploadItem,
): UploadQueueState {
  if (incoming.phase.kind === "rejected") {
    return { ...state, items: [...state.items, incoming] };
  }

  const hasDuplicate = state.items.some(
    (item) =>
      isNonRejected(item) && item.fingerprint === incoming.fingerprint,
  );

  const nonRejectedCount = state.items.filter(isNonRejected).length;
  const item: UploadItem = hasDuplicate
    ? rejectionItem(incoming, "DUPLICATE")
    : nonRejectedCount >= state.policy.maxFilesPerBatch
      ? rejectionItem(incoming, "TOO_MANY_FILES")
      : { ...incoming, prepared: null, phase: { kind: "queued" } };

  return { ...state, items: [...state.items, item] };
}

function handlePrepared(
  state: UploadQueueState,
  index: number,
  prepared: PreparedUpload,
): UploadQueueState {
  const item = state.items[index];
  if (!item || item.phase.kind !== "preparing") {
    return state;
  }

  if (prepared.transport === "mock") {
    return updateItem(state, index, { kind: "finalizing" }, prepared);
  }

  // The browser has not reported an XHR total yet. Keep progress indeterminate
  // until a PROGRESS event supplies one rather than deriving it from file size.
  return updateItem(
    state,
    index,
    { kind: "uploading", loaded: 0, total: null },
    prepared,
  );
}

function handleProgress(
  state: UploadQueueState,
  index: number,
  loaded: number,
  total: number | null,
): UploadQueueState {
  const item = state.items[index];
  if (
    !item ||
    item.phase.kind !== "uploading" ||
    !Number.isFinite(loaded) ||
    loaded < 0 ||
    (total !== null && (!Number.isFinite(total) || total < 0))
  ) {
    return state;
  }

  if (loaded < item.phase.loaded) {
    return state;
  }

  if (total !== null && loaded > total) {
    return state;
  }

  if (loaded === item.phase.loaded && total === item.phase.total) {
    return state;
  }

  return updateItem(state, index, { kind: "uploading", loaded, total });
}

function handleFailure(
  state: UploadQueueState,
  index: number,
  event: Extract<UploadQueueEvent, { type: "FAIL" }>,
): UploadQueueState {
  const item = state.items[index];
  if (!item) {
    return state;
  }

  const expectedStep =
    item.phase.kind === "preparing"
      ? "prepare"
      : item.phase.kind === "uploading"
        ? "upload"
        : item.phase.kind === "finalizing"
          ? "finalize"
          : null;

  if (expectedStep !== event.step) {
    return state;
  }

  return updateItem(state, index, {
    kind: "failed",
    step: event.step,
    code: event.code,
    retryable: event.retryable,
  });
}

function handleRetry(
  state: UploadQueueState,
  index: number,
  ticketValid: boolean,
): UploadQueueState {
  const item = state.items[index];
  if (!item || item.phase.kind !== "failed" || !item.phase.retryable) {
    return state;
  }

  switch (item.phase.step) {
    case "prepare":
      return updateItem(state, index, { kind: "preparing" }, null);
    case "upload":
      return ticketValid
        ? updateItem(
            state,
            index,
            { kind: "uploading", loaded: 0, total: null },
            item.prepared,
          )
        : updateItem(state, index, { kind: "preparing" }, null);
    case "finalize":
      return updateItem(state, index, { kind: "finalizing" });
  }
}

/**
 * Applies one queue event. Invalid transitions return the exact same state
 * reference, which lets callers ignore stale transport events cheaply.
 */
export function uploadQueueReducer(
  state: UploadQueueState,
  event: UploadQueueEvent,
): UploadQueueState {
  if (event.type === "ADD") {
    return addItem(state, event.item);
  }

  const index = findItemIndex(state, event.itemId);
  if (index < 0) {
    return state;
  }

  const item = state.items[index];

  switch (event.type) {
    case "START":
      return item.phase.kind === "queued"
        ? updateItem(state, index, { kind: "preparing" })
        : state;
    case "PREPARED":
      return handlePrepared(state, index, event.prepared);
    case "PROGRESS":
      return handleProgress(state, index, event.loaded, event.total);
    case "UPLOADED":
      return item.phase.kind === "uploading"
        ? updateItem(state, index, { kind: "finalizing" })
        : state;
    case "FINALIZED":
      return item.phase.kind === "finalizing"
        ? updateItem(state, index, {
            kind: "done",
            documentId: event.documentId,
          })
        : state;
    case "FAIL":
      return handleFailure(state, index, event);
    case "RETRY":
      return handleRetry(state, index, event.ticketValid === true);
    case "REMOVE":
      return ["rejected", "queued", "failed", "uploading", "done"].includes(
        item.phase.kind,
      )
        ? { ...state, items: state.items.filter((_, itemIndex) => itemIndex !== index) }
        : state;
  }
}
