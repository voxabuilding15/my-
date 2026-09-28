import { fireEvent, screen, within } from 'expo-router/testing-library';

import { usePreferencesStore } from '@/core/storage/preferences-store';
import { renderApp, signedInApp } from '@/test-utils/render-app';

jest.setTimeout(20_000);

describe('first-launch onboarding', () => {
  it('walks through three slides and then shows the welcome screen', async () => {
    const app = renderApp({ onboarded: false });
    expect(await screen.findByText('All your study material in one place')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/onboarding');

    fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText('An AI tutor that knows your documents')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText('Remember more with less effort')).toBeOnTheScreen();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();

    fireEvent.press(screen.getByText('Get started'));
    expect(await screen.findByText('Study smarter with AI')).toBeOnTheScreen();
    expect(usePreferencesStore.getState().onboardingCompleted).toBe(true);
  });

  it('can be skipped', async () => {
    renderApp({ onboarded: false });
    fireEvent.press(await screen.findByTestId('onboarding-skip'));
    expect(await screen.findByText('Study smarter with AI')).toBeOnTheScreen();
  });
});

describe('home: continue learning', () => {
  it('leads with the last document, due cards and progress', async () => {
    await signedInApp();
    const card = within(await screen.findByTestId('continue-card'));
    expect(card.getByText('Cell Biology — Chapter 3: The Cell')).toBeOnTheScreen();
    expect(card.getByText('Page 9 of 24')).toBeOnTheScreen();
    // 5 reviews due + 4 new cards in the demo decks.
    expect(await screen.findByText('9 cards due')).toBeOnTheScreen();
    expect(await screen.findByText('6-day streak')).toBeOnTheScreen();
  });

  it('resumes reading at the saved page', async () => {
    const app = await signedInApp();
    fireEvent.press(await screen.findByTestId('continue-reading'));
    expect(await screen.findByText('9 / 24')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/documents/doc-biology/read');
  });

  it('opens a review session from the due-cards card', async () => {
    const app = await signedInApp();
    fireEvent.press(await screen.findByTestId('review-now'));
    expect(await screen.findByTestId('show-answer')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/flashcards/review');
  });
});
