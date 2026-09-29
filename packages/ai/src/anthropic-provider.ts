import Anthropic from '@anthropic-ai/sdk';

import { AiError } from './errors.ts';
import type {
  AiProvider,
  Citation,
  ImageTextRequest,
  ModelRoute,
  ObjectRequest,
  SourceDocument,
  StopReason,
  StreamEvent,
  TextRequest,
  TextResult,
  TokenUsage,
} from './types.ts';

type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const EPHEMERAL = { type: 'ephemeral' } as const;

/** Page label used in every document section, so answers and quiz items can name pages. */
export const sectionLabel = (pageStart: number, pageEnd: number) =>
  pageStart === pageEnd ? `[Page ${pageStart}]` : `[Pages ${pageStart}–${pageEnd}]`;

function documentBlock(document: SourceDocument, citations: boolean, cache: boolean): ContentBlock {
  return {
    type: 'document',
    title: document.title.slice(0, 200),
    // One text block per section: citations point at blocks, which map back to pages.
    source: {
      type: 'content',
      content: document.sections.map((s) => ({
        type: 'text' as const,
        text: `${sectionLabel(s.pageStart, s.pageEnd)}\n${s.text}`,
      })),
    },
    citations: { enabled: citations },
    ...(cache ? { cache_control: EPHEMERAL } : {}),
  };
}

/**
 * Builds messages so the stable part comes first (prompt caching is a prefix match):
 * document → earlier turns → this turn. A cache breakpoint closes the document (reused across
 * actions and turns) and the history (reused by the next chat turn).
 */
export function buildMessages(request: TextRequest): MessageParam[] {
  const citations = request.citations ?? false;
  const placement = request.placement ?? 'prefix';
  const history = request.history ?? [];
  const doc =
    request.document && request.document.sections.length > 0 ? request.document : undefined;
  const messages: MessageParam[] = [];

  const turns = [...history, { role: 'user' as const, content: request.prompt }];
  turns.forEach((turn, index) => {
    const isFirst = index === 0;
    const isLast = index === turns.length - 1;
    const content: ContentBlock[] = [];
    if (doc && isFirst && placement === 'prefix') content.push(documentBlock(doc, citations, true));
    if (doc && isLast && placement === 'latest') content.push(documentBlock(doc, citations, false));
    // Cache the conversation up to the previous turn, so the next turn re-reads it cheaply.
    const cacheHistory = !isLast && index === turns.length - 2 && history.length >= 2;
    content.push({
      type: 'text',
      text: turn.content,
      ...(cacheHistory ? { cache_control: EPHEMERAL } : {}),
    });
    messages.push({ role: turn.role, content });
  });
  return messages;
}

function baseParams(route: ModelRoute, system: string, messages: MessageParam[]): CreateParams {
  return {
    model: route.model,
    max_tokens: route.maxTokens,
    system: [{ type: 'text', text: system, cache_control: EPHEMERAL }],
    messages,
    ...(route.effort ? { output_config: { effort: route.effort } } : {}),
    ...(route.fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

function usageOf(message: Anthropic.Beta.Messages.BetaMessage): TokenUsage {
  return {
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

function stopReasonOf(message: Anthropic.Beta.Messages.BetaMessage): StopReason {
  if (message.stop_reason === 'refusal') return 'refusal';
  if (message.stop_reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

function textOf(message: Anthropic.Beta.Messages.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** Maps SDK errors to provider-independent kinds (typed classes, most specific first). */
/**
 * Upstream error messages can quote the request (prompt or document text), so only the
 * status, error type and request id are kept: enough to look the call up in the console.
 */
function describeApiError(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { type?: unknown } } | undefined;
  const type = typeof body?.error?.type === 'string' ? body.error.type : 'api_error';
  return `anthropic ${error.status ?? 'n/a'} ${type} (request ${error.requestID ?? 'n/a'})`;
}

export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError)
    return new AiError('rate_limited', describeApiError(error), true);
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiError('auth', describeApiError(error));
  }
  if (error instanceof Anthropic.BadRequestError)
    return new AiError('invalid_request', describeApiError(error));
  if (error instanceof Anthropic.InternalServerError)
    return new AiError('overloaded', describeApiError(error), true);
  if (error instanceof Anthropic.APIConnectionError)
    return new AiError('network', 'anthropic connection failed', true);
  if (error instanceof Anthropic.APIError)
    return new AiError('overloaded', describeApiError(error), (error.status ?? 500) >= 500);
  return new AiError('network', error instanceof Error ? error.name : 'unknown error', true);
}

export function createAnthropicProvider(options: {
  apiKey: string;
  /** Tests only: a mock Messages API. */
  baseURL?: string | undefined;
  client?: Anthropic;
}): AiProvider {
  // Retries (429/5xx/connection) are handled by the SDK; the function adds none on top.
  const client =
    options.client ??
    new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 2,
      timeout: 120_000,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });

  return {
    name: 'anthropic',

    async streamText(
      request: TextRequest,
      onEvent: (event: StreamEvent) => void,
    ): Promise<TextResult> {
      const doc = request.document;
      const citations: Citation[] = [];
      try {
        const stream = client.beta.messages.stream(
          baseParams(request.route, request.system, buildMessages(request)),
          request.signal ? { signal: request.signal } : undefined,
        );
        for await (const event of stream) {
          if (event.type !== 'content_block_delta') continue;
          if (event.delta.type === 'text_delta') {
            onEvent({ type: 'text', text: event.delta.text });
          } else if (event.delta.type === 'citations_delta' && doc) {
            const cite = event.delta.citation;
            if (cite.type !== 'content_block_location') continue;
            const cited = doc.sections.slice(cite.start_block_index, cite.end_block_index);
            if (cited.length === 0) continue;
            const citation: Citation = {
              pageStart: Math.min(...cited.map((s) => s.pageStart)),
              pageEnd: Math.max(...cited.map((s) => s.pageEnd)),
              quote: cite.cited_text.replace(/^\[Pages? [^\]]+\]\n/, '').slice(0, 300),
            };
            citations.push(citation);
            onEvent({ type: 'citation', citation });
          }
        }
        const message = await stream.finalMessage();
        return {
          text: textOf(message),
          citations,
          usage: usageOf(message),
          stopReason: stopReasonOf(message),
        };
      } catch (error) {
        throw toAiError(error);
      }
    },

    async generateJson(request: ObjectRequest) {
      try {
        const messages = buildMessages({ ...request, citations: false, placement: 'prefix' });
        const message = await client.beta.messages
          .stream(
            {
              ...baseParams(request.route, request.system, messages),
              output_config: {
                ...(request.route.effort ? { effort: request.route.effort } : {}),
                format: { type: 'json_schema', schema: request.jsonSchema },
              },
            },
            request.signal ? { signal: request.signal } : undefined,
          )
          .finalMessage();
        return {
          json: textOf(message),
          usage: usageOf(message),
          stopReason: stopReasonOf(message),
        };
      } catch (error) {
        throw toAiError(error);
      }
    },

    async imageToText(request: ImageTextRequest) {
      try {
        const params = baseParams(request.route, 'You transcribe text from images accurately.', [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: request.image.mediaType,
                  data: request.image.base64,
                },
              },
              { type: 'text', text: request.prompt },
            ],
          },
        ]);
        const message = await client.beta.messages
          .stream(params, request.signal ? { signal: request.signal } : undefined)
          .finalMessage();
        return {
          text: textOf(message),
          usage: usageOf(message),
          stopReason: stopReasonOf(message),
        };
      } catch (error) {
        throw toAiError(error);
      }
    },
  };
}
