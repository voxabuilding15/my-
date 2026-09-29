import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

/** Online means a network with internet access; "unknown reachability" counts as online. */
export const isOnlineState = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) =>
  state.isConnected !== false && state.isInternetReachable !== false;

let started = false;

/**
 * Connects TanStack Query to the device's network and app state: queries pause while offline
 * (and are served from the persisted cache), mutations wait, and everything refetches when
 * the connection or the app comes back.
 */
export function setupNetworkManagers(): void {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (Platform.OS !== 'web') setFocused(status === 'active');
    });
    return () => subscription.remove();
  });
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}
