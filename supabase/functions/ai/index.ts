import { errorText } from '@studexa/shared';
import {
  createProviderRegistry,
  createVoyageProvider,
  DEFAULT_PRICES,
  resolveRoutes,
  type ChatTurn,
  type ModelPrice,
} from '@studexa/ai';

import { getAiEnv } from '../_shared/env.ts';
import { withHttp } from '../_shared/http.ts';
import { log } from '../_shared/logger.ts';
import { createAdminClient, getUser, rpc } from '../_shared/supabase.ts';
import { configureTelemetry } from '../_shared/telemetry.ts';
import type { AiDeps, AiSettings } from './deps.ts';
import { createAiHandler } from './handler.ts';

const env = getAiEnv();
const admin = createAdminClient(env);
configureTelemetry(env, admin);
const providers = createProviderRegistry({
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  anthropicBaseUrl: env.ANTHROPIC_BASE_URL,
});
const embeddings = env.VOYAGE_API_KEY
  ? createVoyageProvider({ apiKey: env.VOYAGE_API_KEY, baseUrl: env.VOYAGE_BASE_URL })
  : null;

const SETTINGS_TTL_MS = 60_000;
let settingsCache: { at: number; value: AiSettings } | null = null;

/** Remote config, re-read at most once a minute per instance: admin changes apply within a minute. */
async function loadSettings(): Promise<AiSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const { data, error } = await admin
    .from('app_config')
    .select('key, value')
    .in('key', ['ai.routes', 'ai.pricing', 'ai.context', 'retrieval']);
  if (error) throw error;
  const config = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const context = (config['ai.context'] ?? {}) as {
    history_messages?: number;
    max_context_tokens?: number;
  };
  const retrieval = (config['retrieval'] ?? {}) as { full_context_max_tokens?: number };
  const value: AiSettings = {
    routes: resolveRoutes(config['ai.routes']),
    prices: { ...DEFAULT_PRICES, ...((config['ai.pricing'] ?? {}) as Record<string, ModelPrice>) },
    historyMessages: Math.min(Math.max(context.history_messages ?? 20, 0), 60),
    maxContextTokens: Math.min(Math.max(context.max_context_tokens ?? 150_000, 4_000), 180_000),
    chatFullContextMaxTokens: Math.min(
      Math.max(retrieval.full_context_max_tokens ?? 30_000, 2_000),
      180_000,
    ),
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

const deps: AiDeps = {
  async getCallerId(req) {
    return (await getUser(admin, req))?.user.id ?? null;
  },
  settings: loadSettings,
  provider: (route) => providers(route.provider),
  async admit(userId, metrics) {
    const [row] = await rpc<
      { allowed: boolean; reason: string | null; remaining: number | null }[]
    >(admin, 'begin_ai_request', {
      p_user_id: userId,
      p_metrics: metrics,
    });
    return row ?? { allowed: false, reason: 'unknown', remaining: null };
  },
  async finish({ userId, action, metrics, succeeded, usage, costMicros, latencyMs }) {
    await rpc(admin, 'finish_ai_request', {
      p_user_id: userId,
      p_action: action,
      p_metrics: metrics,
      p_succeeded: succeeded,
      p_model: usage?.model ?? null,
      p_input_tokens: usage ? usage.inputTokens + usage.cacheWriteTokens : 0,
      p_output_tokens: usage?.outputTokens ?? 0,
      p_cached_input_tokens: usage?.cacheReadTokens ?? 0,
      p_cost_micros: costMicros ?? 0,
      p_latency_ms: latencyMs ?? null,
    });
  },
  async getDocument(userId, documentId) {
    const { data, error } = await admin
      .from('documents')
      .select('id, title, status, page_count, token_count, retrieval_mode, extraction_version')
      .eq('id', documentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id,
          title: data.title,
          status: data.status,
          pageCount: data.page_count ?? 0,
          tokenCount: data.token_count ?? 0,
          retrievalMode: data.retrieval_mode,
          extractionVersion: data.extraction_version,
        }
      : null;
  },
  async getPages(documentId, page) {
    let query = admin
      .from('document_pages')
      .select('page_number, content')
      .eq('document_id', documentId)
      .order('page_number');
    if (page) query = query.eq('page_number', page);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({ number: row.page_number, text: row.content }));
  },
  async retrieve(documentId, query, signal) {
    let embedding: number[] | null = null;
    if (embeddings) {
      try {
        [embedding] = (await embeddings.embed([query], 'query', signal)) as [number[]];
      } catch (error) {
        // Full-text search alone still finds relevant passages.
        log('warn', 'ai.query_embedding_failed', { error: errorText(error) });
      }
    }
    const rows = await rpc<{ page_start: number; page_end: number; content: string }[]>(
      admin,
      'match_document_chunks',
      {
        p_document_ids: [documentId],
        p_query: query,
        p_query_embedding: embedding ? `[${embedding.join(',')}]` : null,
        p_match_count: 8,
      },
    );
    return rows.map((r) => ({ pageStart: r.page_start, pageEnd: r.page_end, content: r.content }));
  },
  async getOutput(key) {
    let query = admin.from('ai_outputs').select('id, content').match({
      user_id: key.userId,
      document_id: key.documentId,
      action: key.action,
      params_hash: key.paramsHash,
    });
    query = key.page === null ? query.is('page_number', null) : query.eq('page_number', key.page);
    query =
      key.targetLanguage === null
        ? query.is('target_language', null)
        : query.eq('target_language', key.targetLanguage);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, output: data.content } : null;
  },
  async saveOutput(key, output, model) {
    const { data, error } = await admin
      .from('ai_outputs')
      .upsert(
        {
          user_id: key.userId,
          document_id: key.documentId,
          action: key.action,
          page_number: key.page,
          target_language: key.targetLanguage,
          params_hash: key.paramsHash,
          content: output,
          model,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,document_id,action,page_number,target_language,params_hash' },
      )
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },
  async getConversation(userId, conversationId) {
    const { data, error } = await admin
      .from('conversations')
      .select('document_id, title')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? { documentId: data.document_id, title: data.title } : null;
  },
  async getHistory(conversationId, limit) {
    if (limit === 0) return [];
    const { data, error } = await admin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const turns = (data ?? []).reverse() as ChatTurn[];
    // The model expects the conversation to start with the user.
    while (turns[0]?.role === 'assistant') turns.shift();
    return turns;
  },
  async saveChatTurn({ userId, conversationId, question, answer, citations, usage, setTitle }) {
    const now = Date.now();
    const { data, error } = await admin
      .from('messages')
      .insert(
        [
          {
            conversation_id: conversationId,
            user_id: userId,
            role: 'user',
            content: question,
            // A bulk insert sends NULL, not the column default, for keys a row leaves out.
            citations: [],
            created_at: new Date(now - 1).toISOString(),
          },
          {
            conversation_id: conversationId,
            user_id: userId,
            role: 'assistant',
            content: answer,
            citations,
            model: usage.model,
            input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
            output_tokens: usage.outputTokens,
            created_at: new Date(now).toISOString(),
          },
        ],
        { defaultToNull: false },
      )
      .select('id, role');
    if (error) throw error;
    if (setTitle) {
      await admin
        .from('conversations')
        .update({ title: question.replace(/\s+/g, ' ').slice(0, 80) })
        .eq('id', conversationId);
    }
    return data.find((row) => row.role === 'assistant')?.id ?? '';
  },
  saveQuiz: ({ userId, documentId, title, timeLimitSeconds, model, questions }) =>
    rpc<string>(admin, 'save_generated_quiz', {
      p_user_id: userId,
      p_document_id: documentId,
      p_title: title,
      p_time_limit_seconds: timeLimitSeconds,
      p_model: model,
      p_questions: questions,
    }),
  saveDeck: ({ userId, documentId, title, cards }) =>
    rpc<string>(admin, 'save_generated_deck', {
      p_user_id: userId,
      p_document_id: documentId,
      p_title: title,
      p_cards: cards,
    }),
  now: () => Date.now(),
};

Deno.serve(withHttp('ai', createAiHandler(deps)));
