import type {
  AiProvider,
  AiRouteKey,
  ChatTurn,
  Citation,
  ModelPrice,
  ModelRoute,
  PageText,
  RetrievedChunk,
  TokenUsage,
} from '@studexa/ai';
import type { AiAction } from '@studexa/shared';

export type UsageMetric =
  'ai_requests' | 'chat_messages' | 'quizzes' | 'flashcard_decks' | 'ocr_scans';

export type AiSettings = {
  routes: Record<AiRouteKey, ModelRoute>;
  prices: Record<string, ModelPrice>;
  historyMessages: number;
  /** Most document text in one request: whole-document tools (summaries, quizzes, notes). */
  maxContextTokens: number;
  /** Chat sends the whole document only up to this size; larger ones use retrieval. */
  chatFullContextMaxTokens: number;
};

export type AiDocument = {
  id: string;
  title: string;
  status: 'pending_upload' | 'processing' | 'ready' | 'failed';
  pageCount: number;
  /** Estimated tokens of the extracted text (0 before processing). */
  tokenCount: number;
  retrievalMode: 'full_context' | 'hybrid' | null;
  extractionVersion: number | null;
};

export type OutputKey = {
  userId: string;
  documentId: string;
  action: AiAction;
  page: number | null;
  targetLanguage: string | null;
  paramsHash: string;
};

export type StoredOutput = {
  markdown: string;
  citations: Citation[];
  coveredUntilPage?: number | undefined;
};

export type Admission = { allowed: boolean; reason: string | null; remaining: number | null };

/** Everything the AI function needs from the outside world (Supabase in production, fakes in tests). */
export interface AiDeps {
  getCallerId(req: Request): Promise<string | null>;
  settings(): Promise<AiSettings>;
  provider(route: ModelRoute): AiProvider;
  admit(userId: string, metrics: UsageMetric[]): Promise<Admission>;
  finish(input: {
    userId: string;
    action: AiAction;
    metrics: UsageMetric[];
    succeeded: boolean;
    usage?: TokenUsage | undefined;
    costMicros?: number | undefined;
    latencyMs?: number | undefined;
  }): Promise<void>;
  getDocument(userId: string, documentId: string): Promise<AiDocument | null>;
  getPages(documentId: string, page?: number): Promise<PageText[]>;
  retrieve(documentId: string, query: string, signal: AbortSignal): Promise<RetrievedChunk[]>;
  getOutput(key: OutputKey): Promise<{ id: string; output: StoredOutput } | null>;
  saveOutput(key: OutputKey, output: StoredOutput, model: string): Promise<string>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ documentId: string | null; title: string } | null>;
  getHistory(conversationId: string, limit: number): Promise<ChatTurn[]>;
  saveChatTurn(input: {
    userId: string;
    conversationId: string;
    question: string;
    answer: string;
    citations: Citation[];
    usage: TokenUsage;
    setTitle: boolean;
  }): Promise<string>;
  saveQuiz(input: {
    userId: string;
    documentId: string;
    title: string;
    timeLimitSeconds: number | null;
    model: string;
    questions: unknown[];
  }): Promise<string>;
  saveDeck(input: {
    userId: string;
    documentId: string;
    title: string;
    cards: { front: string; back: string }[];
  }): Promise<string>;
  now(): number;
}
