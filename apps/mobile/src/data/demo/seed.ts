import { newCardSchedule, type CardSchedule } from '@studexa/shared';

import type { ChatMessage, Conversation } from '@/features/chat/domain/chat';
import type { Bookmark, DocumentSummary } from '@/features/documents/domain/document';
import type { Deck, Flashcard } from '@/features/flashcards/domain/flashcards';
import type { StudyProgress } from '@/features/home/domain/progress';
import type { Note } from '@/features/notes/domain/note';
import type { Quiz } from '@/features/quizzes/domain/quiz';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const TOPICS: Record<string, string[]> = {
  'doc-biology': [
    'The cell is the basic structural and functional unit of all living organisms. Cell theory states that all living things are made of cells, that the cell is the smallest unit of life, and that all cells arise from pre-existing cells.',
    'Eukaryotic cells contain membrane-bound organelles. The nucleus stores genetic material; mitochondria produce ATP through cellular respiration; the endoplasmic reticulum and Golgi apparatus synthesise, modify and transport proteins and lipids.',
    'The plasma membrane is a phospholipid bilayer with embedded proteins. It is selectively permeable: small non-polar molecules diffuse freely, while ions and large molecules need channels, carriers or active transport powered by ATP.',
    'Plant cells differ from animal cells by having a cell wall made of cellulose, chloroplasts for photosynthesis, and a large central vacuole that maintains turgor pressure.',
    'Mitosis produces two genetically identical daughter cells. Its phases are prophase, metaphase, anaphase and telophase, followed by cytokinesis, which divides the cytoplasm.',
  ],
  'doc-history': [
    'The Second World War (1939–1945) had deep roots in the unresolved tensions of the First World War. The Treaty of Versailles imposed heavy reparations on Germany and redrew national borders across Europe.',
    'The Great Depression destabilised economies and strengthened extremist movements. In Germany, the Nazi party rose to power in 1933, while Italy and Japan pursued expansionist policies.',
    'The policy of appeasement allowed Germany to remilitarise the Rhineland and annex Austria. The invasion of Poland on 1 September 1939 led Britain and France to declare war.',
    'The war ended in 1945 and reshaped the world: the United Nations was founded, Europe was divided between East and West, and the Cold War began between the United States and the Soviet Union.',
  ],
  'doc-calculus': [
    'The derivative of a function measures how its output changes as its input changes. Formally, f′(x) is the limit of (f(x + h) − f(x)) / h as h approaches 0.',
    'Key rules: the power rule d/dx xⁿ = n·xⁿ⁻¹, the product rule (uv)′ = u′v + uv′, the quotient rule (u/v)′ = (u′v − uv′)/v², and the chain rule (f(g(x)))′ = f′(g(x))·g′(x).',
    'Derivatives find slopes of tangent lines, rates of change and extrema: a differentiable function has a local maximum or minimum only where f′(x) = 0 or at the ends of its domain.',
  ],
  'doc-economics': [
    'The law of demand states that, other things equal, the quantity demanded of a good falls when its price rises. The demand curve therefore slopes downward.',
    'The law of supply states that the quantity supplied rises with price. The market equilibrium is where supply and demand intersect, determining price and quantity.',
    'Shifts in demand come from changes in income, preferences, the prices of related goods, expectations and the number of buyers. Shifts in supply come from input prices, technology and the number of sellers.',
    'Price elasticity of demand measures how strongly quantity responds to price. Goods with close substitutes tend to be elastic; necessities tend to be inelastic.',
  ],
  'doc-french': [
    'Unité 5 — Les voyages. Le billet: ticket. La gare: train station. L’aéroport: airport. Le quai: platform. La valise: suitcase. Réserver: to book.',
    'Phrases utiles: Je voudrais un aller-retour pour Lyon (I would like a return ticket to Lyon). À quelle heure part le train? (What time does the train leave?)',
  ],
};

export function pageText(documentId: string, page: number): string {
  const paragraphs = TOPICS[documentId] ?? [
    'This page contains the text extracted from your document.',
  ];
  const first = paragraphs[(page - 1) % paragraphs.length] ?? '';
  const second = paragraphs[page % paragraphs.length] ?? '';
  return paragraphs.length > 1 ? `${first}\n\n${second}` : first;
}

type Seed = {
  documents: DocumentSummary[];
  bookmarks: Bookmark[];
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  decks: Omit<Deck, 'cardCount' | 'dueCount' | 'newCount'>[];
  cards: Flashcard[];
  quizzes: Quiz[];
  notes: Note[];
  progress: StudyProgress;
};

export function createSeed(now: Date): Seed {
  const t = now.getTime();
  const iso = (offsetMs: number) => new Date(t + offsetMs).toISOString();
  const due = (daysAgo: number, stability: number, difficulty: number): CardSchedule => ({
    state: 'review',
    stability,
    difficulty,
    dueAt: new Date(t - daysAgo * DAY),
    lastReviewedAt: new Date(t - (daysAgo + stability) * DAY),
  });
  const later = (inDays: number, stability: number, difficulty: number): CardSchedule => ({
    state: 'review',
    stability,
    difficulty,
    dueAt: new Date(t + inDays * DAY),
    lastReviewedAt: new Date(t - 2 * DAY),
  });

  const documents: DocumentSummary[] = [
    {
      id: 'doc-biology',
      title: 'Cell Biology — Chapter 3: The Cell',
      kind: 'pdf',
      sizeBytes: 2_400_000,
      pageCount: 24,
      status: 'ready',
      isFavorite: true,
      lastPage: 9,
      lastOpenedAt: iso(-2 * HOUR),
      createdAt: iso(-12 * DAY),
    },
    {
      id: 'doc-calculus',
      title: 'Calculus — Derivatives (scanned notes)',
      kind: 'image',
      sizeBytes: 850_000,
      pageCount: 3,
      status: 'ready',
      isFavorite: false,
      lastPage: 1,
      lastOpenedAt: iso(-1 * DAY),
      createdAt: iso(-3 * DAY),
    },
    {
      id: 'doc-history',
      title: 'World War II: Causes and Consequences',
      kind: 'docx',
      sizeBytes: 540_000,
      pageCount: 12,
      status: 'ready',
      isFavorite: false,
      lastPage: 12,
      lastOpenedAt: iso(-2 * DAY),
      createdAt: iso(-20 * DAY),
    },
    {
      id: 'doc-economics',
      title: 'Principles of Economics: Supply & Demand',
      kind: 'pdf',
      sizeBytes: 5_100_000,
      pageCount: 40,
      status: 'ready',
      isFavorite: true,
      lastPage: null,
      lastOpenedAt: null,
      createdAt: iso(-5 * DAY),
    },
    {
      id: 'doc-french',
      title: 'French Vocabulary — Unit 5',
      kind: 'txt',
      sizeBytes: 12_000,
      pageCount: 2,
      status: 'ready',
      isFavorite: false,
      lastPage: 2,
      lastOpenedAt: iso(-6 * DAY),
      createdAt: iso(-30 * DAY),
    },
  ];

  const card = (
    id: string,
    deckId: string,
    front: string,
    back: string,
    schedule: CardSchedule,
  ): Flashcard => ({ id, deckId, front, back, schedule });

  return {
    documents,
    bookmarks: [
      {
        id: 'bm-1',
        documentId: 'doc-biology',
        documentTitle: documents[0]?.title ?? '',
        page: 4,
        label: 'Plant vs animal cells',
        createdAt: iso(-3 * DAY),
      },
      {
        id: 'bm-2',
        documentId: 'doc-history',
        documentTitle: documents[2]?.title ?? '',
        page: 3,
        label: null,
        createdAt: iso(-8 * DAY),
      },
    ],
    conversations: [
      {
        id: 'conv-biology',
        documentId: 'doc-biology',
        documentTitle: documents[0]?.title ?? null,
        title: 'Mitochondria and ATP',
        preview: 'Mitochondria produce ATP through cellular respiration…',
        messageCount: 2,
        lastMessageAt: iso(-3 * HOUR),
      },
      {
        id: 'conv-economics',
        documentId: 'doc-economics',
        documentTitle: documents[3]?.title ?? null,
        title: 'What shifts a demand curve?',
        preview: 'Changes in income, preferences, related prices…',
        messageCount: 2,
        lastMessageAt: iso(-2 * DAY),
      },
    ],
    messages: {
      'conv-biology': [
        {
          id: 'm1',
          role: 'user',
          content: 'How do mitochondria make energy?',
          citations: [],
          createdAt: iso(-3 * HOUR - 60_000),
        },
        {
          id: 'm2',
          role: 'assistant',
          content:
            'Mitochondria produce **ATP** through cellular respiration. Glucose is broken down and the energy released is stored in ATP molecules, which the cell uses to power its work.',
          citations: [2],
          createdAt: iso(-3 * HOUR),
        },
      ],
      'conv-economics': [
        {
          id: 'm3',
          role: 'user',
          content: 'What shifts a demand curve?',
          citations: [],
          createdAt: iso(-2 * DAY - 60_000),
        },
        {
          id: 'm4',
          role: 'assistant',
          content:
            'The demand curve shifts when something other than the price changes:\n- Income\n- Preferences\n- Prices of related goods\n- Expectations\n- Number of buyers',
          citations: [3],
          createdAt: iso(-2 * DAY),
        },
      ],
    },
    decks: [
      { id: 'deck-biology', title: 'Cell Biology essentials', documentId: 'doc-biology' },
      { id: 'deck-french', title: 'French — Travel vocabulary', documentId: 'doc-french' },
      { id: 'deck-economics', title: 'Supply & Demand', documentId: 'doc-economics' },
    ],
    cards: [
      card(
        'c1',
        'deck-biology',
        'What organelle produces ATP?',
        'The mitochondrion, through cellular respiration.',
        due(0.2, 3, 5),
      ),
      card(
        'c2',
        'deck-biology',
        'What is the plasma membrane made of?',
        'A phospholipid bilayer with embedded proteins.',
        due(1, 2, 6),
      ),
      card(
        'c3',
        'deck-biology',
        'Name the phases of mitosis.',
        'Prophase, metaphase, anaphase, telophase.',
        due(0.5, 4, 7),
      ),
      card(
        'c4',
        'deck-biology',
        'Which structures do plant cells have but animal cells lack?',
        'A cellulose cell wall, chloroplasts and a large central vacuole.',
        later(4, 8, 4),
      ),
      card(
        'c5',
        'deck-biology',
        'State the three parts of cell theory.',
        'All living things are made of cells; the cell is the smallest unit of life; cells come from pre-existing cells.',
        later(9, 15, 5),
      ),
      card('c6', 'deck-french', 'le billet', 'the ticket', due(0.1, 2, 4)),
      card('c7', 'deck-french', 'la gare', 'the train station', due(2, 5, 3)),
      card('c8', 'deck-french', 'réserver', 'to book', later(2, 6, 3)),
      card('c9', 'deck-french', 'la valise', 'the suitcase', newCardSchedule(now)),
      card(
        'c10',
        'deck-economics',
        'State the law of demand.',
        'Other things equal, quantity demanded falls when price rises.',
        newCardSchedule(now),
      ),
      card(
        'c11',
        'deck-economics',
        'What is market equilibrium?',
        'The price and quantity where supply equals demand.',
        newCardSchedule(now),
      ),
      card(
        'c12',
        'deck-economics',
        'Give two causes of a supply shift.',
        'Input prices, technology, number of sellers.',
        newCardSchedule(now),
      ),
    ],
    quizzes: [
      {
        id: 'quiz-biology',
        title: 'The Cell — checkpoint quiz',
        documentId: 'doc-biology',
        questionCount: 5,
        timeLimitSeconds: 300,
        bestScore: null,
        lastAttemptAt: null,
        questions: [
          {
            id: 'q1',
            type: 'multiple_choice',
            prompt: 'Which organelle is known as the powerhouse of the cell?',
            choices: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi apparatus'],
            correctAnswer: 'Mitochondrion',
            explanation: 'Mitochondria produce ATP through cellular respiration.',
            sourcePage: 2,
          },
          {
            id: 'q2',
            type: 'true_false',
            prompt: 'Animal cells have a cellulose cell wall.',
            choices: null,
            correctAnswer: 'false',
            explanation: 'Only plant cells (and some others) have a cellulose wall.',
            sourcePage: 4,
          },
          {
            id: 'q3',
            type: 'multiple_choice',
            prompt: 'In which phase of mitosis do chromosomes line up in the middle of the cell?',
            choices: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'],
            correctAnswer: 'Metaphase',
            explanation: 'During metaphase, chromosomes align at the metaphase plate.',
            sourcePage: 5,
          },
          {
            id: 'q4',
            type: 'short_answer',
            prompt: 'What molecule stores energy for the cell?',
            choices: null,
            correctAnswer: 'ATP',
            explanation: 'Adenosine triphosphate (ATP) is the cell’s energy currency.',
            sourcePage: 2,
          },
          {
            id: 'q5',
            type: 'true_false',
            prompt: 'The plasma membrane is selectively permeable.',
            choices: null,
            correctAnswer: 'true',
            explanation: 'It lets some substances through freely and controls others.',
            sourcePage: 3,
          },
        ],
      },
      {
        id: 'quiz-history',
        title: 'WWII — causes',
        documentId: 'doc-history',
        questionCount: 3,
        timeLimitSeconds: null,
        bestScore: 67,
        lastAttemptAt: iso(-4 * DAY),
        questions: [
          {
            id: 'h1',
            type: 'multiple_choice',
            prompt: 'Which treaty ended the First World War?',
            choices: ['Treaty of Paris', 'Treaty of Versailles', 'Treaty of Rome'],
            correctAnswer: 'Treaty of Versailles',
            explanation: 'Signed in 1919, it imposed reparations on Germany.',
            sourcePage: 1,
          },
          {
            id: 'h2',
            type: 'true_false',
            prompt: 'Germany invaded Poland in 1939.',
            choices: null,
            correctAnswer: 'true',
            explanation: 'The invasion on 1 September 1939 started the war in Europe.',
            sourcePage: 3,
          },
          {
            id: 'h3',
            type: 'short_answer',
            prompt: 'Which international organisation was founded in 1945?',
            choices: null,
            correctAnswer: 'United Nations',
            explanation: 'The UN was founded to maintain international peace.',
            sourcePage: 4,
          },
        ],
      },
    ],
    notes: [
      {
        id: 'note-1',
        title: 'Exam checklist',
        content:
          '- Cell theory (3 parts)\n- Organelles and functions\n- Mitosis phases\n- Membrane transport',
        isPinned: true,
        documentId: 'doc-biology',
        source: 'manual',
        updatedAt: iso(-5 * HOUR),
      },
      {
        id: 'note-2',
        title: 'Chain rule',
        content: '(f(g(x)))′ = f′(g(x)) · g′(x)\nExample: d/dx sin(x²) = 2x·cos(x²)',
        isPinned: false,
        documentId: 'doc-calculus',
        source: 'manual',
        updatedAt: iso(-1 * DAY),
      },
      {
        id: 'note-3',
        title: 'Summary — Supply & Demand',
        content:
          '## Key ideas\n- Demand slopes down, supply slopes up\n- Equilibrium where they meet\n- Elasticity measures responsiveness',
        isPinned: false,
        documentId: 'doc-economics',
        source: 'ai',
        updatedAt: iso(-3 * DAY),
      },
    ],
    progress: {
      currentStreak: 6,
      longestStreak: 14,
      dailyGoalMinutes: 20,
      todayMinutes: 15,
      weekMinutes: [25, 40, 10, 30, 35, 20, 15],
      cardsReviewedThisWeek: 48,
      quizzesThisWeek: 3,
    },
  };
}
