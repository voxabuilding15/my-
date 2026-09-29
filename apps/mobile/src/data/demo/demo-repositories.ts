import {
  AppError,
  TRANSLATION_LANGUAGES,
  documentKindFromMime,
  newCardSchedule,
  type AppLocale,
  type TranslationLanguage,
} from '@studexa/shared';

import type { AppRepositories } from '@/data/app-repositories';
import type {
  AiRepository,
  AiRequest,
  AiResult,
  AnswerReport,
} from '@/features/ai-tools/domain/ai-tools';
import type { ChatMessage, ChatRepository, Conversation } from '@/features/chat/domain/chat';
import type { DocumentSummary, UploadInput } from '@/features/documents/domain/document';
import type { DocumentsRepository } from '@/features/documents/domain/documents-repository';
import type {
  Deck,
  DeckOptions,
  Flashcard,
  FlashcardsRepository,
  ReviewInput,
} from '@/features/flashcards/domain/flashcards';
import type { ProgressRepository, StudyProgress } from '@/features/home/domain/progress';
import type { Note, NoteDraft, NotesRepository } from '@/features/notes/domain/note';
import {
  gradeAnswer,
  type QuizOptions,
  type QuizResult,
  type QuizzesRepository,
} from '@/features/quizzes/domain/quiz';
import type {
  PlanStatus,
  PremiumPackage,
  SubscriptionRepository,
} from '@/features/subscription/domain/subscription';

import { createSeed, pageText } from './seed';

type Options = { latencyMs?: number; tokenDelayMs?: number; now?: () => Date };

/**
 * In-memory backend with realistic study content, used until the Supabase implementations
 * land (Phase 5). Relationships mirror the database: deleting a document deletes its chats
 * and bookmarks; notes, quizzes and decks survive, unlinked.
 */
export class DemoStore {
  readonly latencyMs: number;
  readonly tokenDelayMs: number;
  readonly now: () => Date;
  private sequence = 0;
  readonly state: ReturnType<typeof createSeed>;

  constructor({ latencyMs = 250, tokenDelayMs = 18, now = () => new Date() }: Options = {}) {
    this.latencyMs = latencyMs;
    this.tokenDelayMs = tokenDelayMs;
    this.now = now;
    this.state = createSeed(now());
  }

  id(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.now().getTime()}-${this.sequence}`;
  }

  async delay(ms = this.latencyMs) {
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Emits text word by word, like a streamed model response. */
  async stream(text: string, onToken: (partial: string) => void) {
    const words = text.split(/(\s+)/);
    let partial = '';
    for (const word of words) {
      partial += word;
      if (this.tokenDelayMs > 0 && word.trim()) await this.delay(this.tokenDelayMs);
      onToken(partial);
    }
    return text;
  }

  document(id: string): DocumentSummary {
    const doc = this.state.documents.find((d) => d.id === id);
    if (!doc) throw new AppError('not_found');
    return doc;
  }
}

/** First sentence of each page, for demo quizzes and decks. */
function demoSentences(documentId: string, pageCount: number) {
  return Array.from({ length: Math.max(1, pageCount) }, (_, i) => {
    const text = pageText(documentId, i + 1);
    return { page: i + 1, sentence: (text.split(/(?<=\.)\s+/)[0] ?? text).trim() };
  });
}

/** Deep copy (keeps Dates) so callers can't mutate the store; avoids relying on structuredClone. */
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

export class DemoDocumentsRepository implements DocumentsRepository {
  constructor(private readonly store: DemoStore) {}

  async list() {
    await this.store.delay();
    return clone(this.store.state.documents);
  }

  async get(id: string) {
    await this.store.delay();
    return clone(this.store.document(id));
  }

  async pages(id: string) {
    await this.store.delay();
    const doc = this.store.document(id);
    return Array.from({ length: doc.pageCount }, (_, i) => ({
      number: i + 1,
      text: pageText(id, i + 1),
    }));
  }

  async resumePendingUploads() {
    return 0;
  }

  async upload(input: UploadInput) {
    await this.store.delay(this.store.latencyMs * 3);
    const kind = documentKindFromMime(input.mimeType);
    if (!kind) throw new AppError('unsupported_file_type');
    if (input.sizeBytes > 10 * 1024 * 1024) throw new AppError('file_too_large');
    const doc: DocumentSummary = {
      id: this.store.id('doc'),
      title: input.name.replace(/\.[a-z0-9]+$/i, '') || 'Untitled',
      kind,
      sizeBytes: input.sizeBytes,
      pageCount: kind === 'image' ? 1 : Math.max(1, Math.round(input.sizeBytes / 60_000)),
      status: 'ready',
      isFavorite: false,
      lastPage: null,
      lastOpenedAt: null,
      createdAt: this.store.now().toISOString(),
    };
    this.store.state.documents.unshift(doc);
    return clone(doc);
  }

  async rename(id: string, title: string) {
    await this.store.delay();
    this.store.document(id).title = title;
    for (const bookmark of this.store.state.bookmarks)
      if (bookmark.documentId === id) bookmark.documentTitle = title;
  }

  async setFavorite(id: string, favorite: boolean) {
    await this.store.delay();
    this.store.document(id).isFavorite = favorite;
  }

  async remove(id: string) {
    await this.store.delay();
    const { state } = this.store;
    state.documents = state.documents.filter((d) => d.id !== id);
    state.bookmarks = state.bookmarks.filter((b) => b.documentId !== id);
    const removed = new Set(
      state.conversations.filter((c) => c.documentId === id).map((c) => c.id),
    );
    state.conversations = state.conversations.filter((c) => !removed.has(c.id));
    for (const conversationId of removed) delete state.messages[conversationId];
    for (const note of state.notes) if (note.documentId === id) note.documentId = null;
    for (const quiz of state.quizzes) if (quiz.documentId === id) quiz.documentId = null;
    for (const deck of state.decks) if (deck.documentId === id) deck.documentId = null;
  }

  async recordProgress(id: string, page: number) {
    const doc = this.store.document(id);
    doc.lastPage = Math.min(doc.pageCount, Math.max(1, page));
    doc.lastOpenedAt = this.store.now().toISOString();
  }

  async bookmarks(documentId?: string) {
    await this.store.delay();
    return clone(
      this.store.state.bookmarks
        .filter((b) => !documentId || b.documentId === documentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async toggleBookmark(documentId: string, page: number) {
    const { state } = this.store;
    const existing = state.bookmarks.find((b) => b.documentId === documentId && b.page === page);
    if (existing) {
      state.bookmarks = state.bookmarks.filter((b) => b !== existing);
      return false;
    }
    state.bookmarks.push({
      id: this.store.id('bm'),
      documentId,
      documentTitle: this.store.document(documentId).title,
      page,
      label: null,
      createdAt: this.store.now().toISOString(),
    });
    return true;
  }
}

export class DemoChatRepository implements ChatRepository {
  constructor(private readonly store: DemoStore) {}

  async conversations(query = '') {
    await this.store.delay();
    const needle = query.trim().toLocaleLowerCase();
    const { conversations, messages } = this.store.state;
    return clone(
      conversations
        .filter(
          (c) =>
            !needle ||
            c.title.toLocaleLowerCase().includes(needle) ||
            (messages[c.id] ?? []).some((m) => m.content.toLocaleLowerCase().includes(needle)),
        )
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    );
  }

  async messages(conversationId: string) {
    await this.store.delay();
    return clone(this.store.state.messages[conversationId] ?? []);
  }

  async openConversation(documentId: string | null) {
    await this.store.delay();
    const { state } = this.store;
    const existing = documentId
      ? state.conversations.find((c) => c.documentId === documentId)
      : undefined;
    if (existing) return clone(existing);
    const conversation: Conversation = {
      id: this.store.id('conv'),
      documentId,
      documentTitle: documentId ? this.store.document(documentId).title : null,
      title: '',
      preview: '',
      messageCount: 0,
      lastMessageAt: this.store.now().toISOString(),
    };
    state.conversations.unshift(conversation);
    state.messages[conversation.id] = [];
    return clone(conversation);
  }

  async send(
    conversationId: string,
    text: string,
    _language: AppLocale,
    onToken: (partial: string) => void,
  ) {
    const { state } = this.store;
    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (!conversation) throw new AppError('not_found');
    const thread = (state.messages[conversationId] ??= []);
    thread.push({
      id: this.store.id('msg'),
      role: 'user',
      content: text,
      citations: [],
      createdAt: this.store.now().toISOString(),
    });
    await this.store.delay();

    const page = conversation.documentId ? (thread.length % 3) + 1 : null;
    const source = conversation.documentId
      ? pageText(conversation.documentId, page ?? 1).split('\n\n')[0]
      : null;
    const reply = source
      ? `Based on your document (page ${page}):\n\n${source}\n\nWould you like a quiz or flashcards on this?`
      : `Here's a clear way to think about it:\n\n- Break the question into smaller parts\n- Connect each part to what you already know\n- Test yourself with a quick question\n\nOpen a document to get answers grounded in your own material.`;
    const content = await this.store.stream(reply, onToken);

    const message: ChatMessage = {
      id: this.store.id('msg'),
      role: 'assistant',
      content,
      citations: page ? [{ pageStart: page, pageEnd: page, quote: source ?? '' }] : [],
      createdAt: this.store.now().toISOString(),
    };
    thread.push(message);
    conversation.title ||= text.slice(0, 60);
    conversation.preview = content.replace(/\s+/g, ' ').slice(0, 90);
    conversation.messageCount = thread.length;
    conversation.lastMessageAt = message.createdAt;
    return clone(message);
  }

  async remove(conversationId: string) {
    await this.store.delay();
    const { state } = this.store;
    state.conversations = state.conversations.filter((c) => c.id !== conversationId);
    delete state.messages[conversationId];
  }
}

export class DemoFlashcardsRepository implements FlashcardsRepository {
  constructor(private readonly store: DemoStore) {}

  async generate(documentId: string, { cardCount }: DeckOptions) {
    await this.store.delay(this.store.latencyMs * 4);
    const doc = this.store.document(documentId);
    const deckId = this.store.id('deck');
    this.store.state.decks.unshift({ id: deckId, title: doc.title, documentId });
    const sentences = demoSentences(doc.id, doc.pageCount).slice(0, cardCount);
    for (const { page, sentence } of sentences) {
      this.store.state.cards.push({
        id: this.store.id('card'),
        deckId,
        front: `${doc.title} — p. ${page}`,
        back: sentence,
        schedule: newCardSchedule(this.store.now()),
      });
    }
    return deckId;
  }

  async decks(): Promise<Deck[]> {
    await this.store.delay();
    const now = this.store.now().getTime();
    return this.store.state.decks.map((deck) => {
      const cards = this.store.state.cards.filter((c) => c.deckId === deck.id);
      return {
        ...deck,
        cardCount: cards.length,
        dueCount: cards.filter(
          (c) => c.schedule.state !== 'new' && c.schedule.dueAt.getTime() <= now,
        ).length,
        newCount: cards.filter((c) => c.schedule.state === 'new').length,
      };
    });
  }

  async dueCards(deckId?: string): Promise<Flashcard[]> {
    await this.store.delay();
    const now = this.store.now().getTime();
    return clone(
      this.store.state.cards
        .filter((c) => (!deckId || c.deckId === deckId) && c.schedule.dueAt.getTime() <= now)
        // Due reviews first (most overdue first), then new cards.
        .sort(
          (a, b) =>
            Number(a.schedule.state === 'new') - Number(b.schedule.state === 'new') ||
            a.schedule.dueAt.getTime() - b.schedule.dueAt.getTime(),
        ),
    );
  }

  async review({ cardId, result }: ReviewInput) {
    await this.store.delay(0);
    const card = this.store.state.cards.find((c) => c.id === cardId);
    if (!card) throw new AppError('not_found');
    const { scheduledDays: _days, ...schedule } = result;
    card.schedule = schedule;
    this.store.state.progress.cardsReviewedThisWeek += 1;
  }
}

export class DemoQuizzesRepository implements QuizzesRepository {
  constructor(private readonly store: DemoStore) {}

  async generate(documentId: string, { questionCount, timeLimitMinutes }: QuizOptions) {
    await this.store.delay(this.store.latencyMs * 4);
    const doc = this.store.document(documentId);
    const id = this.store.id('quiz');
    const questions = demoSentences(doc.id, doc.pageCount)
      .slice(0, questionCount)
      .map(({ page, sentence }, index) => ({
        id: `${id}-q${index}`,
        type: 'true_false' as const,
        prompt: sentence,
        choices: null,
        correctAnswer: 'true',
        explanation: `Stated on page ${page}.`,
        sourcePage: page,
      }));
    this.store.state.quizzes.unshift({
      id,
      title: doc.title,
      documentId,
      questionCount: questions.length,
      timeLimitSeconds: timeLimitMinutes ? timeLimitMinutes * 60 : null,
      bestScore: null,
      lastAttemptAt: null,
      questions,
    });
    return id;
  }

  async list() {
    await this.store.delay();
    return this.store.state.quizzes.map(({ questions: _questions, ...summary }) => clone(summary));
  }

  async get(id: string) {
    await this.store.delay();
    const quiz = this.store.state.quizzes.find((q) => q.id === id);
    if (!quiz) throw new AppError('not_found');
    return clone(quiz);
  }

  async submit(
    quizId: string,
    answers: Record<string, string>,
    elapsedSeconds: number,
  ): Promise<QuizResult> {
    await this.store.delay();
    const quiz = this.store.state.quizzes.find((q) => q.id === quizId);
    if (!quiz) throw new AppError('not_found');
    const graded = quiz.questions.map((question) => {
      const answer = answers[question.id] ?? '';
      return {
        questionId: question.id,
        answer,
        correct: answer ? gradeAnswer(question, answer) : false,
      };
    });
    const score = graded.filter((a) => a.correct).length;
    const percent = Math.round((score / quiz.questions.length) * 100);
    quiz.bestScore = Math.max(quiz.bestScore ?? 0, percent);
    quiz.lastAttemptAt = this.store.now().toISOString();
    this.store.state.progress.quizzesThisWeek += 1;
    return {
      score,
      maxScore: quiz.questions.length,
      timedOut: quiz.timeLimitSeconds !== null && elapsedSeconds > quiz.timeLimitSeconds + 15,
      answers: graded,
    };
  }
}

export class DemoNotesRepository implements NotesRepository {
  constructor(private readonly store: DemoStore) {}

  async list() {
    await this.store.delay();
    return clone(this.store.state.notes);
  }

  async get(id: string) {
    await this.store.delay();
    const note = this.store.state.notes.find((n) => n.id === id);
    if (!note) throw new AppError('not_found');
    return clone(note);
  }

  async save(draft: NoteDraft): Promise<Note> {
    await this.store.delay(0);
    const { notes } = this.store.state;
    const updatedAt = this.store.now().toISOString();
    const existing = draft.id ? notes.find((n) => n.id === draft.id) : undefined;
    if (existing) {
      Object.assign(existing, {
        title: draft.title,
        content: draft.content,
        isPinned: draft.isPinned,
        updatedAt,
      });
      return clone(existing);
    }
    const note: Note = {
      id: draft.id ?? this.store.id('note'),
      title: draft.title,
      content: draft.content,
      isPinned: draft.isPinned,
      documentId: draft.documentId ?? null,
      source: 'manual',
      updatedAt,
    };
    notes.unshift(note);
    return clone(note);
  }

  async remove(id: string) {
    await this.store.delay(0);
    this.store.state.notes = this.store.state.notes.filter((n) => n.id !== id);
  }
}

const AI_TEMPLATES: Record<AiRequest['action'], (title: string, text: string) => string> = {
  summarize: (title, text) =>
    `## Summary — ${title}\n\n${text.split('\n\n')[0]}\n\n## Key points\n- ${text
      .split(/(?<=\.)\s+/)
      .slice(0, 4)
      .join('\n- ')}`,
  explain: (_title, text) =>
    `## Explanation\n\n${text.split('\n\n')[0]}\n\n**In other words:** this page introduces the core idea and the terms you will need for the rest of the chapter.`,
  eli10: () =>
    `## Like you're 10\n\nImagine a city. Every building has a job: a power station makes energy, a library keeps the instructions, and roads carry things around. **A cell works the same way** — tiny parts inside it each have a job, and together they keep it alive.`,
  notes: (title, text) =>
    `## Notes — ${title}\n\n${text
      .split(/(?<=\.)\s+/)
      .slice(0, 6)
      .map((s) => `- ${s}`)
      .join('\n')}`,
  mind_map: (title) =>
    `# ${title}\n- Core ideas\n  - Definitions\n  - Key principles\n- Details\n  - Examples\n  - Exceptions\n- Applications\n  - Exam questions\n  - Real-world links`,
  study_plan: (title) =>
    `## 5-day plan — ${title}\n\n1. **Day 1:** Read pages 1–5 and summarise each in two sentences\n2. **Day 2:** Flashcards on key terms (15 min)\n3. **Day 3:** Pages 6–12 + practice questions\n4. **Day 4:** Timed quiz, review mistakes\n5. **Day 5:** Mind map from memory, then compare`,
  practice_questions: (title) =>
    `## Practice questions — ${title}\n\n1. Define the main concept in your own words.\n2. Explain how two key ideas from the text are related.\n3. Give a real-world example and justify it.\n4. What would change if one assumption were removed?`,
  translate: (_title, text) => text,
};

export class DemoAiRepository implements AiRepository {
  constructor(private readonly store: DemoStore) {}

  async run(request: AiRequest, onToken: (partial: string) => void): Promise<AiResult> {
    await this.store.delay(this.store.latencyMs * 2);
    const doc = this.store.document(request.documentId);
    const text = pageText(doc.id, request.page ?? 1);
    const markdown = await this.store.stream(
      AI_TEMPLATES[request.action](doc.title, text),
      onToken,
    );
    const page = request.page ?? 1;
    return {
      markdown,
      model: 'demo',
      cached: false,
      citations:
        request.action === 'translate' ? [] : [{ pageStart: page, pageEnd: page, quote: '' }],
      outputId: this.store.id('output'),
      coveredUntilPage: null,
    };
  }

  async report(_report: AnswerReport) {
    await this.store.delay();
  }

  async translate(text: string, _from: TranslationLanguage | 'auto', to: TranslationLanguage) {
    await this.store.delay(this.store.latencyMs * 2);
    return `[${TRANSLATION_LANGUAGES[to]}] ${text}`;
  }
}

export class DemoProgressRepository implements ProgressRepository {
  constructor(private readonly store: DemoStore) {}

  async progress(): Promise<StudyProgress> {
    await this.store.delay();
    return clone(this.store.state.progress);
  }

  async logStudyTime(seconds: number) {
    const progress = this.store.state.progress;
    const minutes = Math.round(Math.min(seconds, 3600) / 60);
    progress.todayMinutes += minutes;
    const last = progress.weekMinutes.length - 1;
    progress.weekMinutes[last] = (progress.weekMinutes[last] ?? 0) + minutes;
  }
}

export class DemoSubscriptionRepository implements SubscriptionRepository {
  private tier: PlanStatus['tier'] = 'free';

  constructor(private readonly store: DemoStore) {}

  async status(): Promise<PlanStatus> {
    await this.store.delay();
    const premium = this.tier === 'premium';
    return {
      tier: this.tier,
      renewsAt: premium
        ? new Date(this.store.now().getTime() + 30 * 86_400_000).toISOString()
        : null,
      usage: [
        { metric: 'ai_requests', used: 12, quota: premium ? null : 20 },
        { metric: 'chat_messages', used: 4, quota: premium ? null : 30 },
        { metric: 'uploads', used: 3, quota: premium ? null : 5 },
        { metric: 'quizzes', used: 1, quota: premium ? null : 3 },
        { metric: 'flashcard_decks', used: 1, quota: premium ? null : 3 },
      ],
    };
  }

  async packages(): Promise<PremiumPackage[]> {
    await this.store.delay();
    // Demo prices; real, localised prices come from Google Play via RevenueCat.
    return [
      {
        id: 'premium_yearly',
        period: 'yearly',
        price: '$39.99',
        pricePerMonth: '$3.33',
        savingsPercent: 33,
        trialDays: 7,
      },
      {
        id: 'premium_monthly',
        period: 'monthly',
        price: '$4.99',
        pricePerMonth: null,
        savingsPercent: null,
        trialDays: null,
      },
    ];
  }

  async purchase(_packageId: string) {
    await this.store.delay(this.store.latencyMs * 3);
    this.tier = 'premium';
    return this.status();
  }

  async restore() {
    return this.status();
  }
}

export type { AppRepositories };

export function createDemoRepositories(options?: Options): AppRepositories & { store: DemoStore } {
  const store = new DemoStore(options);
  return {
    store,
    documents: new DemoDocumentsRepository(store),
    chat: new DemoChatRepository(store),
    flashcards: new DemoFlashcardsRepository(store),
    quizzes: new DemoQuizzesRepository(store),
    notes: new DemoNotesRepository(store),
    ai: new DemoAiRepository(store),
    progress: new DemoProgressRepository(store),
    subscription: new DemoSubscriptionRepository(store),
  };
}
