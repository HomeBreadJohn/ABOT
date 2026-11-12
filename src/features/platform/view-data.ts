import type { PresentationCategory } from "@/lib/presentation";

/**
 * Primitive input for the platform presentation adapter.
 *
 * This view data intentionally has no document, analysis, provider, or
 * persistence identity. Consumers can pass `descriptor` to the generic
 * presentation adapter without importing an analysis contract.
 */
export interface PlatformPreviewDescriptor {
  readonly category: PresentationCategory;
  readonly value: string;
}

export interface PlatformPreviewItem {
  readonly title: string;
  readonly descriptor: PlatformPreviewDescriptor;
}

export interface PlatformPreviewData {
  readonly isMock: true;
  readonly contentLabel: "Sample";
  readonly items: readonly PlatformPreviewItem[];
}

/**
 * Deterministic, local-only primitive view data for foundation previews.
 * `contentLabel` must be rendered with the preview so this cannot be mistaken
 * for a completed user analysis.
 */
export const platformPreviewData: PlatformPreviewData = {
  isMock: true,
  contentLabel: "Sample",
  items: [
    {
      title: "Processing status",
      descriptor: { category: "status", value: "ANALYZING" },
    },
    {
      title: "Review priority",
      descriptor: { category: "severity", value: "MEDIUM" },
    },
    {
      title: "Information certainty",
      descriptor: { category: "certainty", value: "HIGH" },
    },
  ],
};
