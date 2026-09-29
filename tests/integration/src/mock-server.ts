/**
 * Stand-ins for the external APIs, so the whole backend can run in CI without real keys:
 * Anthropic Messages (streaming, citations, structured output, vision), Voyage embeddings and
 * an email inbox. Deterministic by design; special markers in a prompt trigger failure modes.
 *
 *   MOCK_REFUSE   → stop_reason "refusal"
 *   MOCK_ERROR    → HTTP 500 (the SDK retries)
 *   MOCK_SLOW     → 1 s between streamed tokens
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 54400);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 20);

type Json = Record<string, any>;
type Recorded = { at: number; path: string; model?: string; summary: Json };

const requests: Recorded[] = [];
const inbox: Json[] = [];
const seenPrefixes = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b: Json) => (b.type === 'text' ? b.text : '')).join('\n');
}

/** Finds the document block (if any) and the text of the newest user turn. */
function inspect(body: Json) {
  const messages: Json[] = body.messages ?? [];
  let document: Json | undefined;
  let image = false;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block.type === 'document') document = block;
      if (block.type === 'image') image = true;
    }
  }
  const last = messages.at(-1);
  const prompt = textOf(last?.content);
  const sections: string[] = document?.source?.content?.map((b: Json) => b.text) ?? [];
  const cached = JSON.stringify(messages).includes('"cache_control"');
  return {
    document,
    sections,
    image,
    prompt,
    cached,
    citations: Boolean(document?.citations?.enabled),
  };
}

function languageOf(prompt: string) {
  if (prompt.includes('Arabic')) return 'ar';
  if (prompt.includes('French')) return 'fr';
  return 'en';
}

const ANSWERS = {
  en: 'According to your document,',
  fr: 'D’après votre document,',
  ar: 'وفقًا لمستندك،',
} as const;

function pageOf(section: string): number {
  return Number(/\[Pages? (\d+)/.exec(section)?.[1] ?? 1);
}

function structured(body: Json, sections: string[]): string {
  const schema = body.output_config?.format?.schema ?? {};
  const pages = sections.map(pageOf);
  const page = (i: number) => pages[i % Math.max(pages.length, 1)] ?? 1;
  if (schema.properties?.questions) {
    const count = Number(/exactly (\d+) questions/.exec(inspect(body).prompt)?.[1] ?? 5);
    return JSON.stringify({
      title: 'Mock quiz',
      questions: Array.from({ length: count }, (_, i) =>
        i % 2 === 0
          ? {
              type: 'multiple_choice',
              prompt: `Question ${i + 1}?`,
              choices: ['A', 'B', 'C', 'D'],
              correct_answer: 'B',
              explanation: `See page ${page(i)}.`,
              source_page: page(i),
            }
          : {
              type: 'true_false',
              prompt: `Statement ${i + 1}.`,
              choices: [],
              correct_answer: 'true',
              explanation: `See page ${page(i)}.`,
              source_page: page(i),
            },
      ),
    });
  }
  const count = Number(/exactly (\d+) flashcards/.exec(inspect(body).prompt)?.[1] ?? 5);
  return JSON.stringify({
    title: 'Mock deck',
    cards: Array.from({ length: count }, (_, i) => ({
      front: `Term ${i + 1}`,
      back: `Definition ${i + 1}`,
      source_page: page(i),
    })),
  });
}

async function messages(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const info = inspect(body);
  const prefix = createHash('sha256')
    .update(JSON.stringify([body.system, info.document?.source]))
    .digest('hex');
  const cacheHit = info.cached && info.document ? seenPrefixes.has(prefix) : false;
  if (info.cached && info.document) seenPrefixes.add(prefix);
  requests.push({
    at: Date.now(),
    path: '/v1/messages',
    model: body.model,
    summary: {
      stream: Boolean(body.stream),
      effort: body.output_config?.effort ?? null,
      structured: Boolean(body.output_config?.format),
      fallbacks: body.fallbacks ?? null,
      citations: info.citations,
      sections: info.sections.length,
      image: info.image,
      cached: info.cached,
      historyTurns: (body.messages ?? []).length,
      language: languageOf(info.prompt),
      promptHead: info.prompt.slice(0, 200),
    },
  });

  if (info.prompt.includes('MOCK_ERROR'))
    return send(res, 500, { type: 'error', error: { type: 'api_error', message: 'mock failure' } });

  const language = languageOf(info.prompt);
  const refusal = info.prompt.includes('MOCK_REFUSE');
  const text = refusal
    ? ''
    : body.output_config?.format
      ? structured(body, info.sections)
      : info.image
        ? 'Photosynthesis converts light energy into chemical energy.'
        : info.sections.length
          ? `${ANSWERS[language]} ${info.sections[0]!.replace(/^\[[^\]]+\]\n/, '').slice(0, 120)}`
          : `${ANSWERS[language]} (no document)`;
  const inputTokens = 200 + JSON.stringify(body.messages ?? []).length / 4;
  const usage = {
    input_tokens: Math.round(cacheHit ? 50 : inputTokens),
    output_tokens: Math.round(text.length / 4) + 1,
    cache_read_input_tokens: cacheHit ? Math.round(inputTokens) : 0,
    cache_creation_input_tokens: info.cached && !cacheHit ? Math.round(inputTokens) : 0,
  };
  const message = {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: [] as Json[],
    stop_reason: null,
    stop_sequence: null,
    usage,
  };

  if (!body.stream) {
    await sleep(LATENCY_MS);
    return send(res, 200, {
      ...message,
      content: text ? [{ type: 'text', text }] : [],
      stop_reason: refusal ? 'refusal' : 'end_turn',
    });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const event = (type: string, data: Json) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event('message_start', { message: { ...message, usage: { ...usage, output_tokens: 1 } } });
  if (text) {
    event('content_block_start', {
      index: 0,
      content_block: { type: 'text', text: '', ...(info.citations ? { citations: [] } : {}) },
    });
    const words = text.split(/(?<= )/);
    for (const word of words) {
      await sleep(
        info.prompt.includes('MOCK_SLOW') ? 1000 : LATENCY_MS / Math.max(words.length, 1),
      );
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: word } });
    }
    if (info.citations && info.sections.length) {
      event('content_block_delta', {
        index: 0,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'content_block_location',
            cited_text: info.sections[0],
            document_index: 0,
            document_title: info.document?.title ?? null,
            start_block_index: 0,
            end_block_index: 1,
            file_id: null,
          },
        },
      });
    }
    event('content_block_stop', { index: 0 });
  }
  event('message_delta', {
    delta: { stop_reason: refusal ? 'refusal' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: usage.output_tokens },
  });
  event('message_stop', {});
  res.end();
}

async function embeddings(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const dims = Number(body.output_dimension ?? 1024);
  requests.push({
    at: Date.now(),
    path: '/v1/embeddings',
    summary: { inputs: body.input.length, kind: body.input_type },
  });
  const vector = (text: string) => {
    const seed = createHash('sha256').update(text).digest();
    return Array.from(
      { length: dims },
      (_, i) => ((seed[i % 32]! / 255) * 2 - 1) / Math.sqrt(dims),
    );
  };
  send(res, 200, {
    data: body.input.map((text: string, index: number) => ({ embedding: vector(text), index })),
    model: body.model,
  });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://mock');
    if (req.method === 'POST' && url.pathname === '/anthropic/v1/messages')
      return await messages(req, res);
    if (req.method === 'POST' && url.pathname === '/voyage/v1/embeddings')
      return await embeddings(req, res);
    if (req.method === 'POST' && url.pathname === '/email') {
      inbox.push({ ...(await readJson(req)), at: Date.now() });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/email') {
      const to = url.searchParams.get('to');
      return send(
        res,
        200,
        inbox.filter((m) => !to || m.to === to),
      );
    }
    if (req.method === 'GET' && url.pathname === '/__requests')
      return send(res, 200, requests.slice(-500));
    if (req.method === 'DELETE' && url.pathname === '/__requests') {
      requests.length = 0;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'not found' });
  } catch (error) {
    send(res, 500, { error: String(error) });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`mock server on :${PORT}`));
