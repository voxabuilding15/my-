import { onlineManager } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/core/theme';
import { MAX_OFFLINE_PAGES, shouldPersistQuery } from '@/core/query/persistence';
import { OfflineBanner } from '@/shared/ui';

import { isOnlineState } from '../online';

describe('offline detection', () => {
  it('treats unknown reachability as online and a lost network as offline', () => {
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineState({ isConnected: false, isInternetReachable: null })).toBe(false);
  });

  it('shows the offline banner only while offline', () => {
    render(
      <ThemeProvider>
        <OfflineBanner />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText(/offline/i)).toBeTruthy();
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});

describe('what is kept on the device for offline use', () => {
  const query = (queryKey: unknown[], data: unknown, status = 'success') =>
    ({ queryKey, state: { status, data } }) as unknown as Parameters<typeof shouldPersistQuery>[0];

  it('keeps study material that was loaded successfully', () => {
    expect(shouldPersistQuery(query(['documents'], []))).toBe(true);
    expect(shouldPersistQuery(query(['notes'], []))).toBe(true);
    expect(shouldPersistQuery(query(['decks', 'all', 'due'], []))).toBe(true);
    expect(
      shouldPersistQuery(query(['documents', 'd1', 'pages'], [{ number: 1, text: 'x' }])),
    ).toBe(true);
  });

  it('skips errors, config and the text of very large documents', () => {
    expect(shouldPersistQuery(query(['documents'], undefined, 'error'))).toBe(false);
    expect(shouldPersistQuery(query(['app-config'], {}))).toBe(false);
    expect(shouldPersistQuery(query(['device-integrity'], {}))).toBe(false);
    const pages = Array.from({ length: MAX_OFFLINE_PAGES + 1 }, (_, i) => ({
      number: i + 1,
      text: 'x',
    }));
    expect(shouldPersistQuery(query(['documents', 'd1', 'pages'], pages))).toBe(false);
  });
});
