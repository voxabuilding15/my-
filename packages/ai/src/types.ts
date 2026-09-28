import type { AiAction } from '@studexa/shared';

export type ProviderName = 'anthropic';

/** Where an action runs. Stored in app_config so it can change without a release. */
export type ModelRoute = {
  provider: ProviderName;
  model: string;
  maxTokens: number;
  /** Reasoning effort, for models that support it. Omit for models that don't (Haiku 4.5). */
  effort?: 'low' | 'medium' | 'high' | undefined;
  /** Retry a safety decline on the provider's recommended fallback model, where supported. */
  fallback?: boolean | undefined;
};

/** One citable unit of a document: a page, or a retrieved chunk spanning pages. */
export type SourceSection = { pageStart: number; pageEnd: number; text: string };

export type SourceDocument = { title: string; sections: SourceSection[] };

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type { Citation } from '@studexa/shared';
import type { Citation } from '@studexa/shared';

export type TokenUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type StreamEvent = { type: 'text'; text: string } | { type: 'citation'; citation: Citation };

export type StopReason = 'end' | 'max_tokens' | 'refusal';

export type TextResult = {
  text: string;
  citations: Citation[];
  usage: TokenUsage;
  stopReason: StopReason;
};

/**
 * Where the document goes in the conversation:
 * - `prefix`: first message, cached — the same document across actions and chat turns reuses the cache.
 * - `latest`: the newest user turn — for retrieved chunks that change per question.
 */
export type SourcePlacement = 'prefix' | 'latest';

export type TextRequest = {
  route: ModelRoute;
  system: string;
  document?: SourceDocument | undefined;
  placement?: SourcePlacement | undefined;
  /** Earlier turns (chat), oldest first. */
  history?: ChatTurn[] | undefined;
  /** The instruction or question for this turn. */
  prompt: string;
  citations?: boolean | undefined;
  signal?: AbortSignal | undefined;
};

export type ObjectRequest = Omit<TextRequest, 'citations' | 'history' | 'placement'> & {
  jsonSchema: Record<string, unknown>;
};

export type ImageTextRequest = {
  route: ModelRoute;
  prompt: string;
  image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };
  signal?: AbortSignal | undefined;
};

/** A model provider. Anthropic today; others (OpenAI, Gemini) implement the same contract. */
export interface AiProvider {
  readonly name: ProviderName;
  streamText(request: TextRequest, onEvent: (event: StreamEvent) => void): Promise<TextResult>;
  /** Returns raw JSON text constrained to `jsonSchema`; callers validate it. */
  generateJson(
    request: ObjectRequest,
  ): Promise<{ json: string; usage: TokenUsage; stopReason: StopReason }>;
  imageToText(
    request: ImageTextRequest,
  ): Promise<{ text: string; usage: TokenUsage; stopReason: StopReason }>;
}

export type AiRouteKey = AiAction | 'chat';
