# Studexa — AI

Every AI feature goes through one Edge Function, `ai`, built on the provider-independent
package `packages/ai`. The app never holds a model key.

## Models (remote config)

| Model                 | Used for                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Claude Haiku 4.5**  | Chat, explanations, "explain like I'm 10", translation, flashcards, practice questions |
| **Claude Haiku 4.5**  | Any document tool asked about **one page** (`page_tool` route), whatever the action    |
| **Claude Sonnet 5.5** | Summaries, quizzes, study plans, mind maps, notes, photo OCR (Arabic/handwriting)      |

Defaults live in `packages/ai/src/routes.ts`; **Remote config → `ai.routes`** overrides any
action without an app release, e.g.

```json
{ "chat": { "model": "claude-sonnet-5-5", "effort": "low" }, "quiz": { "maxTokens": 12000 } }
```

Each route has `provider`, `model`, `maxTokens`, and optionally `effort` (Sonnet 5.5: `low` for
content generation, `medium` for quizzes) and `fallback`. Invalid overrides are ignored rather
than breaking AI. Sonnet routes enable Anthropic's **server-side refusal fallback**
(`fallbacks: "default"`): if a safety classifier wrongly declines a study request, the API
retries it on the recommended fallback model in the same call. Prices for cost estimates are in
`ai.pricing`; the settings are re-read at most once a minute.

**Adding a provider** (OpenAI, Gemini): implement `AiProvider` (`streamText`, `generateJson`,
`imageToText`) and register it in `registry.ts`; routes then name it. Nothing else changes —
prompts, citations, quotas and storage are provider-independent.

## Request flow

1. Auth, validation (shared zod contract), document ownership and state (`document_not_ready`).
2. **Stored result?** Summaries, notes, mind maps etc. are stored per document, page, language,
   extraction version and model. Opening one again streams the stored text: instant, free, no
   quota. "Regenerate" bypasses it.
3. **Admission** (`begin_ai_request`, one atomic call): kill switch (`ai.enabled`), daily budget
   (`ai.daily_budget_usd`), per-user rate limits (`ai.rate_limits`, 12/min and 150/h by default),
   then every quota the action uses — all or nothing. Refusals arrive as normal JSON errors
   before streaming begins (`rate_limited`, `quota_exceeded`, `ai_unavailable`,
   `email_unverified`).
4. **Stream** (server-sent events): `start` (model, remaining quota) → `text` deltas →
   `citation` events → `done` (citations, stored ids) or `error`.
5. **Accounting** (`finish_ai_request`): tokens, cache reads, estimated cost and latency go to
   `usage_events` (dashboard + budget). A failed or declined request gives its quota back; a
   user who leaves mid-answer keeps it spent.

| Action                     | Quotas used                       |
| -------------------------- | --------------------------------- |
| Document tools, translator | `ai_requests`                     |
| Chat                       | `chat_messages`                   |
| Quiz                       | `ai_requests` + `quizzes`         |
| Flashcards                 | `ai_requests` + `flashcard_decks` |
| Photo OCR (server)         | `ocr_scans`                       |

## Grounding, citations, no hallucinations

- Documents are sent as a Claude **document** made of one block per page (or per retrieved
  chunk), each labelled `[Page N]`. With citations enabled, every cited passage maps back to its
  page, and the app shows "Sources: p. 2 · p. 5" chips that open the reader at that page.
- The system prompt requires answers to use only the document, to name pages, and to say plainly
  when the document doesn't contain the answer ("Your document doesn't cover this.") — never to
  guess. Document text is treated as material, never as instructions (prompt-injection guard).
- Quizzes and flashcards use **structured outputs** (JSON schema) plus server-side validation:
  multiple-choice answers must be one of the choices, true/false answers are normalised,
  duplicates are removed, and pages outside the document are dropped.
- Chat without a document may use general knowledge, saying when it is unsure.

## Large documents

| Request                                                                    | Document text sent                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chat, document ≤ `retrieval.full_context_max_tokens` (30k, `full_context`) | Whole text, cached (see below)                                                                                          |
| Chat, larger document (`hybrid`)                                           | The 8 most relevant chunks: Postgres full-text + Voyage vectors, merged with reciprocal rank fusion                     |
| Whole-document tools (summary, notes, mind map, quiz, flashcards…)         | Every page in order up to `ai.context.max_context_tokens` (150k); beyond it the answer says which page it covered up to |
| One-page tools                                                             | That page only                                                                                                          |

The 150k whole-document limit is a product decision: long PDFs are read in full, not sampled.
Only chat, which asks one question at a time, uses retrieval above 30k tokens (≈ 60–80
pages). Documents processed before the threshold was lowered keep `full_context` but chat still
routes them by size (`token_count`), using full-text search until they are reprocessed.

Embeddings are created by the Cloud Run worker (`document_embed` jobs, resumable, Voyage
`voyage-3.5`). Without a Voyage key, large documents use full-text search only.

## Cost: prompt caching and routing

- **Model routing:** light tasks (chat, explanations, translation, flashcards, practice
  questions, and any tool on a single page) run on Haiku; Sonnet is kept for whole-document
  generation and runs at `low` effort except quizzes (`medium`).
- **Context routing:** the full 150k-token context is used only by whole-document tools. Chat
  on documents above 30k tokens sends the relevant passages instead of the whole text with
  every question.
- **Prompt caching:** one constant system prompt for every action, and the document placed
  first with a cache breakpoint, so follow-up requests on the same document within five minutes
  read it from cache (10% of the input price). Caches are per model and per request shape: a
  Sonnet summary and a Sonnet study plan share the cached document, a Haiku request or a quiz
  (structured output, no citations) writes its own. Chat history carries a second breakpoint,
  so each new turn re-reads the conversation from cache. Retrieved chunks (which change per
  question) go in the newest turn, after the cached prefix. Haiku caches only prefixes of 4,096
  tokens or more, so very short documents are simply sent again (a fraction of a cent).
- **Response caching:** stored results (above) replay summaries, notes, mind maps etc. for free
  and without quota; the key includes the model, so a route change regenerates once.
- Dashboard **AI usage** shows requests, cost per model, cached tokens and failures; the daily
  budget and kill switch stop spend instantly.

## Language

Answers are written in the app language (English, French or Arabic) regardless of the document
language; the translate icon in the tool and chat headers switches it (remembered on the
device). Translation uses its own target language.

## Safety

- Study-focused system prompt for a 13+ audience: declines off-topic or unsafe requests with a
  study alternative, and responds with care to distress.
- Safety declines (`stop_reason: refusal`) end the stream with `ai_declined` and refund quota.
- **Report this answer** (flag icon on tool results and chat answers): reason + optional
  details. The database snapshots the reported text and model; staff review it under
  **Reports** in the dashboard without seeing who reported it. Report counts by reason are on the
  AI usage page.

## OCR (photos)

Hybrid, as chosen: the app reads photos on the device first (ML Kit on Android via
`expo-text-extractor`) — free, private, offline — and sends the text with the upload. When the
device reads too little (Arabic, handwriting; Arabic-language users skip it), the worker reads the
photo with Claude vision (`ocr` route, `ocr_scans` quota).

## Tests

`packages/ai` (message layout and caching, citation mapping, routes, pricing, schemas), the `ai`
function (streaming, stored results, admission errors, refusals, chat retrieval, quizzes),
database (`13_ai.test.sql`: admission, refunds, kill switch, budget, rate limits, saving
generated material, embeddings, report snapshots), worker (OCR, embeddings) and app (SSE parser,
repositories, the AI tool flow with citations, language switch and reporting).
