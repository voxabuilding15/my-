import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { KeyboardAvoidingView } from 'react-native';

import { usePreferencesStore } from '@/core/storage/preferences-store';
import { signedInApp } from '@/test-utils/render-app';

jest.setTimeout(30_000);

describe('flashcards', () => {
  it("reviews a deck with know / don't know and schedules the cards", async () => {
    const app = await signedInApp({ initialUrl: '/flashcards/review?deckId=deck-french' });
    // Due reviews first (most overdue first), then new cards.
    expect(await screen.findByText('la gare')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('show-answer'));
    expect(screen.getByText('the train station')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('rate-3'));

    fireEvent.press(await screen.findByTestId('show-answer'));
    fireEvent.press(screen.getByTestId('rate-1'));

    fireEvent.press(await screen.findByTestId('show-answer'));
    fireEvent.press(screen.getByTestId('rate-4'));

    expect(await screen.findByText('Session complete')).toBeOnTheScreen();
    expect(screen.getByText('You reviewed 3 cards. See you next time!')).toBeOnTheScreen();

    const decks = await app.demo.flashcards.decks();
    // "Don't know" brings le billet back within minutes; the others are scheduled days out.
    const french = decks.find((d) => d.id === 'deck-french');
    expect(french).toMatchObject({ newCount: 0 });
    const again = await app.demo.flashcards.dueCards('deck-french');
    expect(again).toHaveLength(0);
  });
});

describe('quizzes', () => {
  it('takes a timed quiz and reviews the graded answers', async () => {
    await signedInApp({ initialUrl: '/quizzes/quiz-biology' });
    fireEvent.press(await screen.findByTestId('start-quiz'));
    expect(await screen.findByTestId('quiz-timer')).toHaveTextContent('5:00');

    fireEvent.press(await screen.findByText('Mitochondrion'));
    fireEvent.press(screen.getByTestId('next-question'));
    fireEvent.press(await screen.findByTestId('choice-false'));
    fireEvent.press(screen.getByTestId('next-question'));
    fireEvent.press(await screen.findByText('Anaphase'));
    fireEvent.press(screen.getByTestId('next-question'));
    fireEvent.changeText(await screen.findByTestId('short-answer'), ' atp. ');
    fireEvent.press(screen.getByTestId('next-question'));
    fireEvent.press(await screen.findByTestId('choice-true'));
    fireEvent.press(screen.getByTestId('finish-quiz'));

    expect(await screen.findByTestId('quiz-score')).toHaveTextContent('80%');
    expect(screen.getByText('Good job — keep practising.')).toBeOnTheScreen();
    expect(screen.getByText('Correct answer: Metaphase')).toBeOnTheScreen();
  });
});

describe('notes', () => {
  it('creates a note that autosaves and appears pinned in the list', async () => {
    const app = await signedInApp({ initialUrl: '/notes/new' });
    fireEvent.changeText(await screen.findByTestId('note-title'), 'Photosynthesis');
    fireEvent.changeText(screen.getByTestId('note-content'), 'Light → chemical energy');
    fireEvent.press(screen.getByTestId('pin-note'));
    // Debounced autosave (800 ms) with real timers.
    await waitFor(
      async () =>
        expect(
          (await app.demo.notes.list()).find((n) => n.title === 'Photosynthesis'),
        ).toMatchObject({
          isPinned: true,
          content: 'Light → chemical energy',
        }),
      { timeout: 3000 },
    );
  });
});

describe('chat', () => {
  it('answers from the document with a page citation', async () => {
    const app = await signedInApp({ initialUrl: '/chat/conv-biology' });
    expect(await screen.findByText('How do mitochondria make energy?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('chat-input'), 'What is the plasma membrane?');
    fireEvent.press(screen.getByTestId('send-message'));
    expect(await screen.findByText('What is the plasma membrane?')).toBeOnTheScreen();
    await waitFor(async () =>
      expect((await app.demo.chat.messages('conv-biology')).length).toBe(4),
    );
    expect(await screen.findByText(/Based on your document/)).toBeOnTheScreen();
  });

  // Regression: on Android the keyboard covered the message bar (no avoiding behaviour there,
  // and the edge-to-edge window does not shrink), so students could not see or tap Send.
  it('keeps the message bar above the keyboard on every platform', async () => {
    await signedInApp({ initialUrl: '/chat/conv-biology' });
    await screen.findByTestId('chat-keyboard-avoider');
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });
});

describe('settings and subscription', () => {
  it('switches the theme and study goal', async () => {
    await signedInApp({ initialUrl: '/settings' });
    fireEvent.press(await screen.findByTestId('theme-dark'));
    expect(usePreferencesStore.getState().theme).toBe('dark');
    fireEvent.press(screen.getByText('45 min'));
    expect(usePreferencesStore.getState().dailyGoalMinutes).toBe(45);
    usePreferencesStore.setState({ theme: 'system', dailyGoalMinutes: 20 });
  });

  it('upgrades to Premium from the paywall', async () => {
    await signedInApp({ initialUrl: '/paywall' });
    fireEvent.press(await screen.findByTestId('package-yearly'));
    fireEvent.press(screen.getByTestId('subscribe'));
    expect(await screen.findByText('You are Premium')).toBeOnTheScreen();
  });
});
