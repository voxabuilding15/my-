import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Storage } from 'expo-sqlite/kv-store';

const KEY_ALIAS = 'studexa.session-key.v1';

/** End-to-end test builds only: names the step of a failing session write in the device log. */
function e2eStep() {
  return async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (process.env.EXPO_PUBLIC_E2E_DIAGNOSTICS === '1') {
        const e = error as { name?: string; message?: string; stack?: string };
        console.error(
          `[e2e-session-storage] step=${label} name=${e?.name} message=${e?.message}\n${e?.stack}`,
        );
      }
      throw error;
    }
  };
}

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
 * The storage key, bound to its ciphertext as AES-GCM additional data. Passed as bytes: the
 * native module reads a string `additionalData` as base64, and key names such as
 * "sb-10-auth-token" are not base64 (the encryption failed with "bad base-64" on Android).
 */
const additionalDataFor = (name: string) => new TextEncoder().encode(name);

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
      const bytes = await aesDecryptAsync(sealed, await getKey(), {
        additionalData: additionalDataFor(name),
      });
      return new TextDecoder().decode(bytes);
    } catch {
      // Key lost (reinstall, restored device) or tampered data: treat as signed out.
      await Storage.removeItem(name);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const step = e2eStep();
    const key = await step('key', () => getKey());
    const sealed = await step('encrypt', () =>
      aesEncryptAsync(new TextEncoder().encode(value), key, {
        additionalData: additionalDataFor(name),
      }),
    );
    const combined = await step('encode', () => sealed.combined('base64'));
    await step('write', () => Storage.setItem(name, combined));
  },
  async removeItem(name: string): Promise<void> {
    await Storage.removeItem(name);
  },
};
