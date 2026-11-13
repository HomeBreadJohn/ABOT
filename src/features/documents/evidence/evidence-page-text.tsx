import { Fragment, type Ref } from "react";

import {
  segmentWords,
  type HighlightResult,
} from "@/features/documents/evidence/compute-highlight";
import { wordConfidenceCue } from "@/features/documents/evidence/confidence-cue";

export interface PageWord {
  readonly index: number;
  readonly text: string;
  readonly confidence: number | null;
}

/**
 * Page words with the cited range and low-confidence words marked. Meaning is
 * never colour alone: the cited run gets a shaded box with an outline plus
 * screen-reader markers, and each low-confidence word gets a dotted underline,
 * a visible "?" and a screen-reader note.
 */
export function EvidencePageText({
  words,
  highlight,
  citedRef,
}: {
  words: readonly PageWord[];
  highlight: HighlightResult;
  citedRef?: Ref<HTMLElement>;
}) {
  const segments = segmentWords(words, highlight);

  return (
    <p className="text-body text-ink break-words">
      {segments.map((segment, segmentIndex) => {
        const content = segment.words.map((word, wordIndex) => (
          <Fragment key={word.index}>
            {wordIndex > 0 ? " " : null}
            {wordConfidenceCue(word.confidence) === "low" ? (
              <span className="underline decoration-dotted decoration-2 underline-offset-4">
                {word.text}
                <sup aria-hidden="true" className="font-semibold">
                  ?
                </sup>
                <span className="sr-only"> (low confidence)</span>
              </span>
            ) : (
              word.text
            )}
          </Fragment>
        ));

        return (
          <Fragment key={segmentIndex}>
            {segmentIndex > 0 ? " " : null}
            {segment.cited ? (
              <mark
                ref={citedRef}
                className="bg-brand-100 text-ink-950 outline-brand-700 rounded-sm px-0.5 outline-2 outline-offset-1"
              >
                <span className="sr-only">Cited passage starts. </span>
                {content}
                <span className="sr-only"> Cited passage ends.</span>
              </mark>
            ) : (
              content
            )}
          </Fragment>
        );
      })}
    </p>
  );
}
