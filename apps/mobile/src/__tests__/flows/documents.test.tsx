import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import { signedInApp } from '@/test-utils/render-app';

jest.setTimeout(20_000);

/** Confirms destructive alerts, as a user tapping "Delete" would. */
function confirmAlerts() {
  return jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
}

afterEach(() => jest.restoreAllMocks());

describe('library', () => {
  it('searches and filters documents', async () => {
    await signedInApp({ initialUrl: '/documents' });
    expect(await screen.findByTestId('document-doc-history')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('document-search'), 'calc');
    expect(await screen.findByTestId('document-doc-calculus')).toBeOnTheScreen();
    expect(screen.queryByTestId('document-doc-history')).toBeNull();

    fireEvent.changeText(screen.getByTestId('document-search'), '');
    fireEvent.press(screen.getByTestId('filter-favorites'));
    expect(await screen.findByTestId('document-doc-economics')).toBeOnTheScreen();
    expect(screen.queryByTestId('document-doc-calculus')).toBeNull();

    fireEvent.changeText(screen.getByTestId('document-search'), 'zzz');
    expect(await screen.findByText('No documents match your search.')).toBeOnTheScreen();
  });

  it('renames a document from its menu', async () => {
    await signedInApp({ initialUrl: '/documents' });
    fireEvent.press(await screen.findByTestId('more-doc-french'));
    fireEvent.press(await screen.findByTestId('action-rename'));
    fireEvent.changeText(await screen.findByTestId('rename-input'), 'French — Travel words');
    fireEvent.press(screen.getByTestId('rename-save'));
    expect(await screen.findByText('French — Travel words')).toBeOnTheScreen();
  });

  it('deletes a document after confirmation', async () => {
    const alert = confirmAlerts();
    const app = await signedInApp({ initialUrl: '/documents' });
    fireEvent.press(await screen.findByTestId('more-doc-history'));
    fireEvent.press(await screen.findByTestId('action-delete'));
    expect(alert).toHaveBeenCalledWith(
      'Delete this document?',
      expect.any(String),
      expect.any(Array),
    );
    await waitFor(() => expect(screen.queryByTestId('document-doc-history')).toBeNull());
    expect(await screen.findByText('Document deleted')).toBeOnTheScreen();
    await expect(app.demo.documents.get('doc-history')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('document tools', () => {
  it('generates a summary and saves it as a note', async () => {
    const app = await signedInApp({ initialUrl: '/documents/doc-biology' });
    fireEvent.press(await screen.findByTestId('tool-summarize'));
    expect(
      await screen.findByText('Summary — Cell Biology — Chapter 3: The Cell'),
    ).toBeOnTheScreen();
    fireEvent.press(await screen.findByTestId('save-note'));
    expect(await screen.findByText('Saved to notes')).toBeOnTheScreen();
    expect(
      (await app.demo.notes.list()).some(
        (n) => n.title === 'Summarize' && n.documentId === 'doc-biology',
      ),
    ).toBe(true);
  });

  it('reads page by page and bookmarks a page', async () => {
    const app = await signedInApp({ initialUrl: '/documents/doc-calculus/read?page=1' });
    expect(await screen.findByText('1 / 3')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('next-page'));
    expect(await screen.findByText('2 / 3')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('bookmark-toggle'));
    expect(await screen.findByText('Page bookmarked')).toBeOnTheScreen();
    expect((await app.demo.documents.bookmarks('doc-calculus')).map((b) => b.page)).toEqual([2]);
    expect((await app.demo.documents.get('doc-calculus')).lastPage).toBe(2);
  });
});
