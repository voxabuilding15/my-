import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState, type PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setupNetworkManagers } from '@/core/network/online';
import { persistOptions } from '@/core/query/persistence';
import { createQueryClient } from '@/core/query/query-client';
import { ThemeProvider } from '@/core/theme';

setupNetworkManagers();

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Offline mode: saved study material is restored from the device on launch. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
          // Paused uploads and edits made offline are sent once the cache is back.
          onSuccess={() => void queryClient.resumePausedMutations()}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
