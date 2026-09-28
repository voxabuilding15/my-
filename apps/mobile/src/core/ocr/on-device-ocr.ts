import { extractTextFromImage, isSupported } from 'expo-text-extractor';

import { i18n } from '@/core/i18n';

/**
 * Hybrid OCR, step 1: read the photo on the device (ML Kit on Android, Vision on iOS) — free,
 * private and offline. Returns '' when the device can't help, and the server reads the photo
 * with Claude vision instead: ML Kit handles Latin scripts but not Arabic or handwriting well,
 * so Arabic-language users go straight to the server.
 */
export async function readTextOnDevice(uri: string): Promise<string> {
  if (!isSupported || i18n.language === 'ar') return '';
  try {
    return (await extractTextFromImage(uri)).join('\n').trim();
  } catch {
    return '';
  }
}
