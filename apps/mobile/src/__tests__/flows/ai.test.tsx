import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { usePreferencesStore } from '@/core/storage/preferences-store';
import { signedInApp } from '@/test-utils/render-app';

jest.setTimeout(30_000);

describe('AI tools', () => {
  beforeEach(() => usePreferencesStore.setState({ answerLanguage: null }));

  it('streams a summary with page sources, shows remaining usage, and reports it', async () => {
    const app = await signedInApp({ initialUrl: '/ai/summarize?documentId=doc-biology' });
    const run = jest.spyOn(app.demo.ai, 'run');

    expect(await screen.findByTestId('citations', {}, { timeout: 5000 })).toHaveTextContent(
      /p\. 1/,
    );
    expect(await screen.findByTestId('ai-usage')).toHaveTextContent(
      'AI requests today: 8 of 20 left',
    );

    // Answers follow the app language unless the user picks another one.
    fireEvent.press(screen.getByTestId('answer-language'));
    fireEvent.press(await screen.findByTestId('action-fr'));
    await waitFor(() =>
      expect(run).toHaveBeenLastCalledWith(
        expect.objectContaining({ language: 'fr' }),
        expect.any(Function),
      ),
    );
    expect(usePreferencesStore.getState().answerLanguage).toBe('fr');

    const report = jest.spyOn(app.demo.ai, 'report');
    fireEvent.press(await screen.findByTestId('report-answer', {}, { timeout: 5000 }));
    fireEvent.press(await screen.findByTestId('report-reason-harmful'));
    fireEvent.press(screen.getByTestId('send-report'));
    expect(await screen.findByText('Thanks, we’ll review it.')).toBeOnTheScreen();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'ai_output', reason: 'harmful' }),
    );
  });

  it('creates a quiz from a document and opens it', async () => {
    await signedInApp({ initialUrl: '/documents/doc-biology' });
    fireEvent.press(await screen.findByTestId('make-quiz'));
    expect(await screen.findByTestId('start-quiz', {}, { timeout: 5000 })).toBeOnTheScreen();
  });
});
