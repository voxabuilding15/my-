import { formatBytes, formatDuration, formatRelative } from '@/core/i18n/format';
import { layoutFor } from '@/core/layout/use-layout';
import { createDemoRepositories } from '@/data/demo/demo-repositories';
import { filterDocuments, type DocumentSummary } from '@/features/documents';
import { sortAndFilterNotes, type Note } from '@/features/notes';
import { gradeAnswer } from '@/features/quizzes';
import { parseBlocks } from '@/shared/ui';

describe('layout size classes (Material 3)', () => {
  it.each([
    [390, 'compact', 1, false],
    [700, 'medium', 2, true],
    [1200, 'expanded', 3, true],
  ] as const)('%ipx is %s', (width, sizeClass, columns, useRail) => {
    expect(layoutFor(width, 800)).toMatchObject({ sizeClass, columns, useRail });
  });
});

describe('formatting', () => {
  it('formats sizes and durations', () => {
    expect(formatBytes(2_400_000, 'en')).toBe('2.3 MB');
    expect(formatBytes(500, 'en')).toBe('500 B');
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats relative times', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    expect(formatRelative('2026-09-28T10:00:00Z', 'en', now)).toBe('2 hours ago');
    expect(formatRelative('2026-09-27T12:00:00Z', 'en', now)).toBe('yesterday');
    expect(formatRelative('2026-09-28T11:59:00Z', 'en', now)).toBe('1 minute ago');
    expect(formatRelative('2026-09-14T12:00:00Z', 'en', now)).toBe('2 weeks ago');
    expect(formatRelative('2026-06-01T12:00:00Z', 'en', now)).toBe('Jun 1');
  });
});

describe('document filtering', () => {
  const doc = (id: string, over: Partial<DocumentSummary>): DocumentSummary => ({
    id,
    title: id,
    kind: 'pdf',
    sizeBytes: 1,
    pageCount: 1,
    status: 'ready',
    isFavorite: false,
    lastPage: null,
    lastOpenedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  });
  const docs = [
    doc('Biology', { isFavorite: true, lastOpenedAt: '2026-09-01T00:00:00Z' }),
    doc('Algebra', { kind: 'docx', sizeBytes: 50 }),
    doc('Chemistry', { lastOpenedAt: '2026-09-10T00:00:00Z' }),
  ];

  it('searches case-insensitively and filters by favourite or kind', () => {
    expect(
      filterDocuments(docs, { query: 'bio', filter: 'all', sort: 'recent' }).map((d) => d.id),
    ).toEqual(['Biology']);
    expect(
      filterDocuments(docs, { query: '', filter: 'favorites', sort: 'recent' }).map((d) => d.id),
    ).toEqual(['Biology']);
    expect(
      filterDocuments(docs, { query: '', filter: 'docx', sort: 'recent' }).map((d) => d.id),
    ).toEqual(['Algebra']);
  });

  it('sorts by recency, name or size', () => {
    expect(
      filterDocuments(docs, { query: '', filter: 'all', sort: 'recent' }).map((d) => d.id),
    ).toEqual(['Chemistry', 'Biology', 'Algebra']);
    expect(
      filterDocuments(docs, { query: '', filter: 'all', sort: 'name' }).map((d) => d.id),
    ).toEqual(['Algebra', 'Biology', 'Chemistry']);
    expect(filterDocuments(docs, { query: '', filter: 'all', sort: 'size' })[0]?.id).toBe(
      'Algebra',
    );
  });
});

describe('notes ordering', () => {
  const note = (id: string, isPinned: boolean, updatedAt: string): Note => ({
    id,
    title: id,
    content: `${id} body`,
    isPinned,
    updatedAt,
    documentId: null,
    source: 'manual',
  });
  it('puts pinned notes first, then most recent, and searches bodies', () => {
    const notes = [
      note('a', false, '2026-09-03'),
      note('b', true, '2026-09-01'),
      note('c', false, '2026-09-05'),
    ];
    expect(sortAndFilterNotes(notes, '').map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(sortAndFilterNotes(notes, 'C BODY').map((n) => n.id)).toEqual(['c']);
  });
});

describe('quiz grading (mirrors the server)', () => {
  const q = { id: 'q', prompt: '', choices: null, explanation: null, sourcePage: null };
  it('ignores case, spacing and trailing punctuation', () => {
    expect(
      gradeAnswer(
        { ...q, type: 'short_answer', correctAnswer: 'United Nations' },
        '  united   nations. ',
      ),
    ).toBe(true);
  });
  it('leaves non-matching short answers for AI grading', () => {
    expect(gradeAnswer({ ...q, type: 'short_answer', correctAnswer: 'ATP' }, 'energy')).toBeNull();
    expect(gradeAnswer({ ...q, type: 'true_false', correctAnswer: 'true' }, 'false')).toBe(false);
  });
});

describe('rich text parsing', () => {
  it('recognises headings, bullets, numbered items and paragraphs', () => {
    expect(
      parseBlocks('## Title\n- one\n  - nested\n1. first\nPlain **bold** text').map((b) => b.type),
    ).toEqual(['heading', 'bullet', 'bullet', 'numbered', 'paragraph']);
  });
});

describe('demo backend relationships (mirror the database)', () => {
  it('deleting a document removes its chats and bookmarks but keeps notes, quizzes and decks', async () => {
    const repos = createDemoRepositories({ latencyMs: 0, tokenDelayMs: 0 });
    await repos.documents.remove('doc-biology');
    expect((await repos.chat.conversations()).some((c) => c.documentId === 'doc-biology')).toBe(
      false,
    );
    expect((await repos.documents.bookmarks()).some((b) => b.documentId === 'doc-biology')).toBe(
      false,
    );
    expect((await repos.notes.get('note-1')).documentId).toBeNull();
    expect((await repos.quizzes.get('quiz-biology')).documentId).toBeNull();
    expect(
      (await repos.flashcards.decks()).find((d) => d.id === 'deck-biology')?.documentId,
    ).toBeNull();
  });

  it('rejects unsupported and oversized uploads', async () => {
    const repos = createDemoRepositories({ latencyMs: 0, tokenDelayMs: 0 });
    await expect(
      repos.documents.upload({
        name: 'a.zip',
        mimeType: 'application/zip',
        sizeBytes: 10,
        uri: 'x',
        source: 'file',
      }),
    ).rejects.toMatchObject({ code: 'unsupported_file_type' });
    await expect(
      repos.documents.upload({
        name: 'b.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 50 * 1024 * 1024,
        uri: 'x',
        source: 'file',
      }),
    ).rejects.toMatchObject({ code: 'file_too_large' });
  });

  it('streams AI output token by token', async () => {
    const repos = createDemoRepositories({ latencyMs: 0, tokenDelayMs: 0 });
    const partials: string[] = [];
    const result = await repos.ai.run(
      { action: 'summarize', documentId: 'doc-biology', language: 'en' },
      (p) => partials.push(p),
    );
    expect(partials.length).toBeGreaterThan(5);
    expect(partials.at(-1)).toBe(result.markdown);
    expect(result.markdown).toContain('## Summary');
    expect(result.citations[0]?.pageStart).toBe(1);
  });

  it('generates a quiz and a deck from a document', async () => {
    const repos = createDemoRepositories({ latencyMs: 0, tokenDelayMs: 0 });
    const quizId = await repos.quizzes.generate('doc-biology', {
      questionCount: 3,
      language: 'en',
    });
    expect((await repos.quizzes.get(quizId)).questions).toHaveLength(3);
    const deckId = await repos.flashcards.generate('doc-biology', { cardCount: 2, language: 'en' });
    expect((await repos.flashcards.dueCards(deckId)).length).toBe(2);
  });
});
