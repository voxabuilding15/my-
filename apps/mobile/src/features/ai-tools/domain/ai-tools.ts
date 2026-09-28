import type { AiAction, AppLocale, Citation, TranslationLanguage } from '@studexa/shared';

/** Actions launched from a document's toolbox (quiz/flashcards/chat have their own flows). */
export const DOCUMENT_TOOLS = [
  'summarize',
  'explain',
  'eli10',
  'notes',
  'mind_map',
  'study_plan',
  'practice_questions',
  'translate',
] as const satisfies readonly AiAction[];
export type DocumentTool = (typeof DOCUMENT_TOOLS)[number];

export type AiRequest = {
  action: DocumentTool;
  documentId: string;
  page?: number;
  targetLanguage?: TranslationLanguage;
  /** Language the answer is written in (translation uses `targetLanguage`). */
  language: AppLocale;
  /** Ignore the stored result and generate a new one. */
  regenerate?: boolean;
};

export type AiResult = {
  markdown: string;
  model: string;
  /** Served from the stored result (free, instant). */
  cached: boolean;
  /** Pages the answer is grounded in. */
  citations: Citation[];
  /** Id of the stored result, for reporting it. */
  outputId: string | null;
  /** Large documents: the answer covers pages up to this one. */
  coveredUntilPage: number | null;
};

export const REPORT_REASONS = ['incorrect', 'harmful', 'offensive', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type AnswerReport = {
  targetType: 'ai_output' | 'message';
  targetId: string;
  reason: ReportReason;
  details?: string;
};

/** Unique pages cited, in order, for page chips. */
export function citedPages(citations: readonly Citation[]): number[] {
  return [...new Set(citations.map((c) => c.pageStart))].sort((a, b) => a - b);
}

export interface AiRepository {
  /** Streams the result through `onToken`; resolves with the final text. */
  run(request: AiRequest, onToken: (partial: string) => void): Promise<AiResult>;
  translate(
    text: string,
    from: TranslationLanguage | 'auto',
    to: TranslationLanguage,
  ): Promise<string>;
  /** "Report this answer": reviewed in the admin dashboard, without the reporter's identity. */
  report(report: AnswerReport): Promise<void>;
}
