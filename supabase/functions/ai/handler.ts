import {
  AiError,
  chatPrompt,
  costMicros,
  documentFromChunks,
  documentFromPages,
  flashcardsPrompt,
  FLASHCARDS_JSON_SCHEMA,
  flashcardsSchema,
  quizPrompt,
  QUIZ_JSON_SCHEMA,
  quizSchema,
  SYSTEM_PROMPT,
  toolPrompt,
  translateTextPrompt,
  type ModelRoute,
  type SourceDocument,
  type TextResult,
  type TokenUsage,
} from '@studexa/ai';
import {
  type AiAction,
  aiRequestSchema,
  type AiStreamEvent,
  type AppErrorCode,
} from '@studexa/shared';

import { HttpError } from '../_shared/errors.ts';
import { corsHeaders, parseBody } from '../_shared/http.ts';
import { log } from '../_shared/logger.ts';
import { reportError } from '../_shared/telemetry.ts';
import type { AiDeps, AiDocument, AiSettings, OutputKey, UsageMetric } from './deps.ts';

type Request_ = ReturnType<typeof aiRequestSchema.parse>;
type Emit = (event: AiStreamEvent) => void;
type DoneFields = Omit<Extract<AiStreamEvent, { type: 'done' }>, 'type' | 'remaining'>;
type RunResult = { usage: TokenUsage; done: DoneFields };

/** A prepared request: either a stored result, or a generation that needs quota. */
type Plan =
  | { kind: 'stored'; model: string; outputId: string; markdown: string; done: DoneFields }
  | {
      kind: 'generate';
      action: AiAction;
      metrics: UsageMetric[];
      route: ModelRoute;
      run: (emit: Emit, signal: AbortSignal) => Promise<RunResult>;
    };

const ADMISSION_ERRORS: Record<string, AppErrorCode> = {
  ai_disabled: 'ai_unavailable',
  budget_exceeded: 'ai_unavailable',
  rate_limited: 'rate_limited',
  email_unverified: 'email_unverified',
  quota_exceeded: 'quota_exceeded',
};

function sse(emitAll: (emit: Emit, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        if (abort.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await emitAll(emit, abort.signal);
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    // The app closed the connection (screen left): stop generating.
    cancel() {
      abort.abort();
    },
  });
  return new Response(body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function readyDocument(
  deps: AiDeps,
  userId: string,
  documentId: string,
): Promise<AiDocument> {
  const doc = await deps.getDocument(userId, documentId);
  if (!doc) throw new HttpError('not_found', 'Document not found');
  if (doc.status !== 'ready')
    throw new HttpError('document_not_ready', 'The document is still being processed');
  return doc;
}

function metricsFor(action: Request_['action']): UsageMetric[] {
  switch (action) {
    case 'chat':
      return ['chat_messages'];
    case 'quiz':
      return ['ai_requests', 'quizzes'];
    case 'flashcards':
      return ['ai_requests', 'flashcard_decks'];
    default:
      return ['ai_requests'];
  }
}

/** Streams text and citations through, and fails on a safety decline. */
async function streamTo(
  deps: AiDeps,
  route: ModelRoute,
  emit: Emit,
  request: Parameters<ReturnType<AiDeps['provider']>['streamText']>[0],
): Promise<TextResult> {
  const result = await deps.provider(route).streamText(request, (event) => {
    if (event.type === 'text') emit({ type: 'text', text: event.text });
    else emit({ type: 'citation', citation: event.citation });
  });
  if (result.stopReason === 'refusal')
    throw new AiError('refused', 'The model declined this request');
  return result;
}

/** The whole document within budget, or one page when a page is requested. */
async function documentContext(deps: AiDeps, doc: AiDocument, settings: AiSettings, page?: number) {
  const pages = await deps.getPages(doc.id, page);
  if (pages.length === 0) throw new HttpError('not_found', 'Page not found');
  return documentFromPages(doc.title, pages, settings.maxContextTokens);
}

async function plan(
  deps: AiDeps,
  userId: string,
  body: Request_,
  settings: AiSettings,
): Promise<Plan> {
  const metrics = metricsFor(body.action);

  switch (body.action) {
    case 'chat': {
      const conversation = await deps.getConversation(userId, body.conversationId);
      if (!conversation) throw new HttpError('not_found', 'Conversation not found');
      const route = settings.routes.chat;
      const doc = conversation.documentId
        ? await readyDocument(deps, userId, conversation.documentId)
        : null;
      return {
        kind: 'generate',
        action: 'document_qa',
        metrics,
        route,
        async run(emit, signal) {
          const history = await deps.getHistory(body.conversationId, settings.historyMessages);
          let document: SourceDocument | undefined;
          let placement: 'prefix' | 'latest' = 'prefix';
          if (doc?.retrievalMode === 'hybrid') {
            // Large documents: the passages most relevant to this question (full-text + vectors).
            document = documentFromChunks(
              doc.title,
              await deps.retrieve(doc.id, body.message, signal),
            );
            placement = 'latest';
          } else if (doc) {
            document = (await documentContext(deps, doc, settings)).document;
          }
          const result = await streamTo(deps, route, emit, {
            route,
            system: SYSTEM_PROMPT,
            document,
            placement,
            history,
            prompt: chatPrompt(body.message, body.language, Boolean(doc)),
            citations: Boolean(document),
            signal,
          });
          const messageId = await deps.saveChatTurn({
            userId,
            conversationId: body.conversationId,
            question: body.message,
            answer: result.text,
            citations: result.citations,
            usage: result.usage,
            setTitle: !conversation.title,
          });
          return { usage: result.usage, done: { citations: result.citations, messageId } };
        },
      };
    }

    case 'translate_text': {
      const route = settings.routes.translate;
      return {
        kind: 'generate',
        action: 'translate',
        metrics,
        route,
        async run(emit, signal) {
          const result = await streamTo(deps, route, emit, {
            route,
            system: SYSTEM_PROMPT,
            prompt: translateTextPrompt(body.text, body.from, body.to),
            signal,
          });
          return { usage: result.usage, done: { citations: [] } };
        },
      };
    }

    case 'quiz':
    case 'flashcards': {
      const doc = await readyDocument(deps, userId, body.documentId);
      const route = settings.routes[body.action];
      return {
        kind: 'generate',
        action: body.action,
        metrics,
        route,
        async run(_emit, signal) {
          const { document, coveredUntilPage } = await documentContext(deps, doc, settings);
          const quiz = body.action === 'quiz';
          const out = await deps.provider(route).generateJson({
            route,
            system: SYSTEM_PROMPT,
            document,
            prompt: quiz
              ? quizPrompt(body.questionCount, body.language)
              : flashcardsPrompt(body.cardCount, body.language),
            jsonSchema: quiz ? QUIZ_JSON_SCHEMA : FLASHCARDS_JSON_SCHEMA,
            signal,
          });
          if (out.stopReason === 'refusal')
            throw new AiError('refused', 'The model declined this request');
          let json: unknown;
          try {
            json = JSON.parse(out.json);
          } catch {
            throw new AiError(
              'invalid_output',
              `unparseable ${body.action} output (${out.stopReason})`,
              true,
            );
          }
          const cover = coveredUntilPage ? { coveredUntilPage } : {};
          if (quiz) {
            const parsed = quizSchema.safeParse(json);
            if (!parsed.success || parsed.data.questions.length === 0)
              throw new AiError('invalid_output', 'no usable questions', true);
            const quizId = await deps.saveQuiz({
              userId,
              documentId: doc.id,
              title: parsed.data.title,
              timeLimitSeconds: body.timeLimitMinutes ? body.timeLimitMinutes * 60 : null,
              model: out.usage.model,
              questions: parsed.data.questions,
            });
            return { usage: out.usage, done: { citations: [], quizId, ...cover } };
          }
          const parsed = flashcardsSchema.safeParse(json);
          if (!parsed.success || parsed.data.cards.length === 0)
            throw new AiError('invalid_output', 'no usable cards', true);
          const deckId = await deps.saveDeck({
            userId,
            documentId: doc.id,
            title: parsed.data.title,
            cards: parsed.data.cards.map(({ front, back }) => ({ front, back })),
          });
          return { usage: out.usage, done: { citations: [], deckId, ...cover } };
        },
      };
    }

    default: {
      const doc = await readyDocument(deps, userId, body.documentId);
      if (body.page && body.page > doc.pageCount)
        throw new HttpError('not_found', 'Page not found');
      const route = settings.routes[body.action];
      const key: OutputKey = {
        userId,
        documentId: doc.id,
        action: body.action,
        page: body.page ?? null,
        targetLanguage: body.action === 'translate' ? (body.targetLanguage ?? 'en') : null,
        // A new extraction, language or model produces a new result.
        paramsHash: `${body.language}|v${doc.extractionVersion ?? 0}|${route.model}`,
      };
      if (!body.regenerate) {
        // Results are stored: opening the same summary again costs nothing and uses no quota.
        const stored = await deps.getOutput(key);
        if (stored) {
          return {
            kind: 'stored',
            model: route.model,
            outputId: stored.id,
            markdown: stored.output.markdown,
            done: {
              citations: stored.output.citations,
              outputId: stored.id,
              ...(stored.output.coveredUntilPage
                ? { coveredUntilPage: stored.output.coveredUntilPage }
                : {}),
            },
          };
        }
      }
      return {
        kind: 'generate',
        action: body.action,
        metrics,
        route,
        async run(emit, signal) {
          const { document, coveredUntilPage } = await documentContext(
            deps,
            doc,
            settings,
            body.page,
          );
          const citations = body.action !== 'translate' && body.action !== 'mind_map';
          const result = await streamTo(deps, route, emit, {
            route,
            system: SYSTEM_PROMPT,
            document,
            prompt: toolPrompt(body.action, {
              page: body.page,
              language: body.language,
              targetLanguage: body.targetLanguage,
            }),
            citations,
            signal,
          });
          const outputId = await deps.saveOutput(
            key,
            { markdown: result.text, citations: result.citations, coveredUntilPage },
            result.usage.model,
          );
          return {
            usage: result.usage,
            done: {
              citations: result.citations,
              outputId,
              ...(coveredUntilPage ? { coveredUntilPage } : {}),
            },
          };
        },
      };
    }
  }
}

function clientError(error: unknown): { code: AppErrorCode; message: string; expected: boolean } {
  if (error instanceof HttpError)
    return { code: error.code, message: error.message, expected: true };
  if (error instanceof AiError) {
    if (error.kind === 'refused') {
      return {
        code: 'ai_declined',
        message: 'This request can’t be answered. Try rephrasing it as a study question.',
        expected: true,
      };
    }
    return {
      code: 'ai_unavailable',
      message: 'The AI is unavailable right now. Please try again shortly.',
      expected: false,
    };
  }
  return { code: 'unknown', message: 'Something went wrong', expected: false };
}

/**
 * POST /ai — one endpoint for every AI feature. Checks (auth, validation, document state,
 * kill switch, budget, rate limits, quotas) run before streaming starts, so they fail as plain
 * JSON errors; the answer then streams as server-sent events.
 */
export function createAiHandler(deps: AiDeps) {
  return async function handle(req: Request): Promise<Response> {
    const userId = await deps.getCallerId(req);
    if (!userId) throw new HttpError('unauthenticated', 'Sign in first');
    const body = await parseBody(req, aiRequestSchema);
    const settings = await deps.settings();
    const prepared = await plan(deps, userId, body, settings);

    if (prepared.kind === 'stored') {
      return sse((emit) => {
        emit({ type: 'start', model: prepared.model, cached: true, remaining: null });
        emit({ type: 'text', text: prepared.markdown });
        emit({ type: 'done', ...prepared.done, remaining: null });
        return Promise.resolve();
      });
    }

    const admission = await deps.admit(userId, prepared.metrics);
    if (!admission.allowed) {
      const code = ADMISSION_ERRORS[admission.reason ?? ''] ?? 'forbidden';
      throw new HttpError(code, admission.reason ?? 'not allowed', { metric: prepared.metrics[0] });
    }

    return sse(async (emit, signal) => {
      const started = deps.now();
      emit({
        type: 'start',
        model: prepared.route.model,
        cached: false,
        remaining: admission.remaining,
      });
      let usage: TokenUsage | undefined;
      try {
        const result = await prepared.run(emit, signal);
        usage = result.usage;
        await deps.finish({
          userId,
          action: prepared.action,
          metrics: prepared.metrics,
          succeeded: true,
          usage,
          costMicros: costMicros(usage, settings.prices),
          latencyMs: deps.now() - started,
        });
        emit({ type: 'done', ...result.done, remaining: admission.remaining });
      } catch (error) {
        // A user who leaves mid-answer keeps the quota spent; real failures give it back.
        const cancelled = signal.aborted;
        await deps
          .finish({
            userId,
            action: prepared.action,
            metrics: prepared.metrics,
            succeeded: cancelled,
            latencyMs: deps.now() - started,
          })
          .catch((e) => log('error', 'ai.finish_failed', { error: String(e) }));
        if (cancelled) return;
        const failure = clientError(error);
        log(failure.expected ? 'warn' : 'error', 'ai.failed', {
          action: prepared.action,
          code: failure.code,
          error: String(error),
        });
        if (!failure.expected)
          reportError({ fn: 'ai', error, userId, context: { action: prepared.action } });
        emit({ type: 'error', code: failure.code, message: failure.message });
      }
    });
  };
}
