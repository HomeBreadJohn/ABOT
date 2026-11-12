import { ANALYSIS_SCHEMA_VERSION } from "@/contracts/analysis";
import type {
  AnalysisResult,
  DocumentCategory,
  Finding,
} from "@/contracts";
import { z } from "zod";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import { AppError } from "@/lib/http/app-error";
import { chunkPages, type Chunk } from "@/features/intelligence/services/chunking";
import {
  getModule,
  type CategoryModule,
} from "@/features/intelligence/modules/registry";
import { classifyDocument } from "@/features/intelligence/services/classify";
import { requestJson } from "@/features/intelligence/services/json-reply";
import {
  chunkFindingsSchema,
  type ChunkFinding,
} from "@/features/intelligence/services/chunk-analysis-schema";
import { PROMPT_VERSION } from "@/features/intelligence/prompts/system-rules";
import { buildChunkAnalysisPrompt } from "@/features/intelligence/prompts/chunk-analysis";
import {
  buildConsolidatePrompt,
  type CompactFinding,
} from "@/features/intelligence/prompts/consolidate";
import type {
  AnalysisEngine,
  AnalysisEngineInput,
  AnalysisEngineResult,
} from "@/features/intelligence/services/analysis-engine";

/** A supporting quote paired with the real page it was found on. */
export type FindingQuote = { quote: string; page: number };

/** A merged finding: one candidate type+title, with every quote+page seen. */
type MergedFinding = {
  type: string;
  title: string;
  informationStatus: ChunkFinding["informationStatus"];
  confidence: number;
  explanation: string;
  basis: string;
  quotes: FindingQuote[];
  pages: number[];
};

const consolidateReplySchema = z.object({
  overview: z.string().default(""),
  explanation: z.string().default(""),
});

/**
 * Hybrid analysis engine: classify once, analyze each chunk, then consolidate.
 * Produces a DRAFT AnalysisResult. Evidence mapping, safety enforcement, and
 * review requirements are chained in B16; this engine only groups candidate
 * findings and records what could not be analyzed.
 */
export class HybridAnalysisEngine implements AnalysisEngine {
  /** Chunk-output cache keyed by contentHash + moduleIds + promptVersion. */
  private readonly chunkCache = new Map<string, ChunkFinding[]>();

  constructor(private readonly chat: ChatProvider) {}

  /** Conforms to the AnalysisEngine interface; drops the quote channel. */
  async analyze(input: AnalysisEngineInput): Promise<AnalysisEngineResult> {
    const { result, outcome } = await this.analyzeWithQuotes(input);
    return { result, outcome };
  }

  /**
   * Like analyze, but also returns the per-finding supporting quotes with their
   * real pages, keyed by the same finding ids bucket() assigns
   * (`${type.toLowerCase()}-${index}`). RealAnalysisEngine uses this to map each
   * quote on its own page instead of defaulting to page 1.
   */
  async analyzeWithQuotes(input: AnalysisEngineInput): Promise<
    AnalysisEngineResult & { quotesByFinding: Map<string, FindingQuote[]> }
  > {
    // Step 1: classify (opens its own session and sends one message).
    const classification = await classifyDocument(
      input.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
      this.chat,
    );
    const category: DocumentCategory = input.category ?? classification.category;
    const categoryModule = getModule(category);

    // Chunk the pages. NormalizedPage is a structural supertype of
    // ChunkablePage (pageNumber/status/text), so it passes straight through.
    const { chunks, failedPages } = chunkPages(input.pages);

    // Step 2: one message per chunk, through the session this engine owns.
    const { sessionId } = await this.chat.openSession();
    const moduleKey = [...categoryModule.moduleIds].sort().join(",");

    const perChunk: ChunkFinding[][] = [];
    const failedChunkPages: number[] = [];
    for (const chunk of chunks) {
      const findings = await this.analyzeChunk(
        chunk,
        categoryModule,
        moduleKey,
        sessionId,
      );
      if (findings === null) {
        failedChunkPages.push(...pagesOfChunk(chunk));
      } else {
        perChunk.push(findings);
      }
    }

    // More than half the chunks failed: this is an analysis failure. Throw so
    // the ANALYZE job handler transitions the document to ANALYSIS_FAILED.
    if (chunks.length > 0 && failedChunkPages.length > 0) {
      const failedChunkCount = chunks.length - perChunk.length;
      if (failedChunkCount * 2 > chunks.length) {
        throw new AppError(
          "INVALID_ANALYSIS",
          "More than half of the document chunks could not be analyzed.",
        );
      }
    }

    // Step 3: merge candidate findings, then one consolidation message.
    const merged = mergeFindings(perChunk.flat());
    const compact: CompactFinding[] = merged.map((m) => ({
      type: m.type,
      title: m.title,
      informationStatus: m.informationStatus,
      pages: m.pages,
    }));
    const consolidation = await requestJson(
      this.chat,
      sessionId,
      buildConsolidatePrompt(compact),
      consolidateReplySchema,
    );

    const unavailablePages = [
      ...new Set([...failedPages, ...failedChunkPages]),
    ].sort((a, b) => a - b);
    const partial = unavailablePages.length > 0;

    const quotesByFinding = new Map<string, FindingQuote[]>();
    const result = this.buildDraft({
      input,
      classification,
      categoryModule,
      overview: consolidation.overview,
      explanation: consolidation.explanation,
      merged,
      partial,
      unavailablePages,
      quotesByFinding,
    });

    return { result, outcome: "COMPLETED", quotesByFinding };
  }

  /** Analyze one chunk, using the cache. Returns null when the chunk fails. */
  private async analyzeChunk(
    chunk: Chunk,
    categoryModule: CategoryModule,
    moduleKey: string,
    sessionId: string,
  ): Promise<ChunkFinding[] | null> {
    const cacheKey = `${chunk.contentHash}|${moduleKey}|${PROMPT_VERSION}`;
    const cached = this.chunkCache.get(cacheKey);
    if (cached) return cached;

    try {
      const parsed = await requestJson(
        this.chat,
        sessionId,
        buildChunkAnalysisPrompt(chunk.content, categoryModule.promptGuidance),
        chunkFindingsSchema,
      );
      this.chunkCache.set(cacheKey, parsed.findings);
      return parsed.findings;
    } catch {
      return null;
    }
  }

  private buildDraft(args: {
    input: AnalysisEngineInput;
    classification: Awaited<ReturnType<typeof classifyDocument>>;
    categoryModule: CategoryModule;
    overview: string;
    explanation: string;
    merged: MergedFinding[];
    partial: boolean;
    unavailablePages: number[];
    quotesByFinding: Map<string, FindingQuote[]>;
  }): AnalysisResult {
    const {
      input,
      classification,
      categoryModule,
      merged,
      partial,
      unavailablePages,
      quotesByFinding,
    } = args;

    const limitations = partial
      ? [
          `Pages ${unavailablePages.join(", ")} could not be analyzed; findings may be incomplete.`,
        ]
      : [];

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      document: {
        documentId: input.documentId,
        documentType: categoryModule.category,
        documentSubtype: classification.subtype || null,
        issuer: classification.issuer || null,
        classificationConfidence: classification.confidence,
      },
      overview: args.overview,
      explanation: args.explanation,
      keyInformation: bucket(merged, "KEY_INFORMATION", quotesByFinding),
      obligations: bucket(merged, "OBLIGATION", quotesByFinding),
      watchouts: bucket(merged, "WATCHOUT", quotesByFinding),
      consequences: bucket(merged, "CONSEQUENCE", quotesByFinding).map((f) => ({
        ...f,
        kind: f.informationStatus === "INFERRED" ? "INFERRED" : "EXPLICIT",
      })),
      nextSteps: bucket(merged, "NEXT_STEP", quotesByFinding),
      importantDates: bucket(merged, "IMPORTANT_DATE", quotesByFinding).map((f) => ({
        ...f,
        date: null,
        dateText: f.title,
      })),
      specializedSections: [],
      evidence: [],
      limitations,
      reviewRequirements: [],
      analysisMetadata: {
        modelInstanceId: null,
        generatedAt: new Date().toISOString(),
        analysisVersion: 1,
        language: input.language,
        categoryModules: categoryModule.moduleIds,
        partial,
        unavailablePages,
      },
    };
  }
}

/** The page numbers a chunk spans, inclusive. */
function pagesOfChunk(chunk: Chunk): number[] {
  const pages: number[] = [];
  for (let p = chunk.pageStart; p <= chunk.pageEnd; p++) pages.push(p);
  return pages;
}

/** Normalize a title for duplicate detection: lowercase, collapsed whitespace. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merge candidate findings across chunks. Two findings with the same type and
 * the same normalized title are one finding; their quotes and pages combine.
 */
function mergeFindings(findings: ChunkFinding[]): MergedFinding[] {
  const byKey = new Map<string, MergedFinding>();
  for (const f of findings) {
    const key = `${f.type}|${normalizeTitle(f.title)}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.quotes.some((q) => q.quote === f.quote)) {
        existing.quotes.push({ quote: f.quote, page: f.page });
      }
      if (!existing.pages.includes(f.page)) existing.pages.push(f.page);
      existing.confidence = Math.max(existing.confidence, f.confidence);
    } else {
      byKey.set(key, {
        type: f.type,
        title: f.title,
        informationStatus: f.informationStatus,
        confidence: f.confidence,
        explanation: f.explanation,
        basis: f.basis,
        quotes: [{ quote: f.quote, page: f.page }],
        pages: [f.page],
      });
    }
  }
  for (const m of byKey.values()) m.pages.sort((a, b) => a - b);
  return [...byKey.values()];
}

/**
 * Draft findings for one bucket. Evidence IDs are empty here (mapping runs in
 * RealAnalysisEngine); each finding's supporting quotes with their real pages
 * are recorded in `quotesByFinding`, keyed by the finding id, so the engine can
 * resolve them on the correct page.
 */
function bucket(
  merged: MergedFinding[],
  type: string,
  quotesByFinding: Map<string, FindingQuote[]>,
): Finding[] {
  return merged
    .filter((m) => m.type === type)
    .map((m, index) => {
      const id = `${type.toLowerCase()}-${index}`;
      quotesByFinding.set(id, m.quotes);
      return {
        id,
        title: m.title,
        explanation: m.explanation,
        informationStatus: m.informationStatus,
        confidence: m.confidence,
        basis: m.basis,
        evidenceIds: [],
      };
    });
}
