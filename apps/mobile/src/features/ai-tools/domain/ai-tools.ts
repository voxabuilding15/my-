import type { AiAction, TranslationLanguage } from '@studexa/shared';

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
};

export type AiResult = { markdown: string; model: string; cached: boolean };

export interface AiRepository {
  /** Streams the result through `onToken`; resolves with the final text. */
  run(request: AiRequest, onToken: (partial: string) => void): Promise<AiResult>;
  translate(
    text: string,
    from: TranslationLanguage | 'auto',
    to: TranslationLanguage,
  ): Promise<string>;
}
