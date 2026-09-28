import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

import { usePreferencesStore } from '@/core/storage/preferences-store';

/** Reads text aloud with the system text-to-speech engine ("Read summaries aloud"). */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const locale = usePreferencesStore((state) => state.locale);

  useEffect(() => () => void Speech.stop(), []);

  const speak = useCallback(
    (text: string, language?: string) => {
      void Speech.stop();
      setSpeaking(true);
      const voiceLanguage = language ?? locale;
      Speech.speak(text.replace(/[#*_`>-]/g, ' '), {
        ...(voiceLanguage ? { language: voiceLanguage } : {}),
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [locale],
  );

  const stop = useCallback(() => {
    void Speech.stop();
    setSpeaking(false);
  }, []);

  return { speaking, speak, stop };
}
