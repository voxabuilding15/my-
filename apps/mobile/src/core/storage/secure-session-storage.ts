import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Storage } from 'expo-sqlite/kv-store';

const KEY_ALIAS = 'studexa.session-key.v1';

let keyPromise: Promise<AESEncryptionKey> | null = null;

/** 256-bit key kept in the Android Keystore / iOS Keychain; created on first use. */
function getKey(): Promise<AESEncryptionKey> {
  keyPromise ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY_ALIAS);
    if (stored) return AESEncryptionKey.import(stored, 'base64');
    const key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(KEY_ALIAS, await key.encoded('base64'), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return key;
  })();
  return keyPromise;
}

/**
 * Supabase session storage. Sessions can exceed SecureStore's value size limit, so they are
 * encrypted with AES-256-GCM (key in the hardware-backed keystore) and the ciphertext is kept in
 * SQLite. The storage key is bound as additional data, so ciphertexts can't be swapped.
 */
export const secureSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const combined = await Storage.getItem(name);
    if (!combined) return null;
    try {
      const sealed = AESSealedData.fromCombined(combined);
      const bytes = await aesDecryptAsync(sealed, await getKey(), { additionalData: name });
      return new TextDecoder().decode(bytes);
    } catch {
      // Key lost (reinstall, restored device) or tampered data: treat as signed out.
      await Storage.removeItem(name);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const sealed = await aesEncryptAsync(new TextEncoder().encode(value), await getKey(), {
      additionalData: name,
    });
    await Storage.setItem(name, await sealed.combined('base64'));
  },
  async removeItem(name: string): Promise<void> {
    await Storage.removeItem(name);
  },
};
