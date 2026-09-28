import { Storage } from 'expo-sqlite/kv-store';

import { secureSessionStorage } from '../secure-session-storage';

// A stand-in for AES-GCM with the properties the storage relies on: output differs from the
// input, and decryption fails when the key or the additional data differ.
jest.mock('expo-crypto', () => {
  class FakeKey {
    constructor(readonly id: string) {}
    static generate = () => Promise.resolve(new FakeKey('key-1'));
    static import = (encoded: string) => Promise.resolve(new FakeKey(encoded));
    encoded = () => Promise.resolve(this.id);
  }
  class FakeSealed {
    constructor(readonly payload: string) {}
    static fromCombined = (combined: string) => new FakeSealed(combined);
    combined = () => Promise.resolve(this.payload);
  }
  return {
    AESEncryptionKey: FakeKey,
    AESSealedData: FakeSealed,
    aesEncryptAsync: (
      plain: Uint8Array,
      key: FakeKey,
      { additionalData }: { additionalData: string },
    ) =>
      Promise.resolve(
        new FakeSealed(
          JSON.stringify({ k: key.id, a: additionalData, p: Array.from(plain).reverse() }),
        ),
      ),
    aesDecryptAsync: (
      sealed: FakeSealed,
      key: FakeKey,
      { additionalData }: { additionalData: string },
    ) => {
      const { k, a, p } = JSON.parse(sealed.payload) as { k: string; a: string; p: number[] };
      if (k !== key.id || a !== additionalData)
        return Promise.reject(new Error('auth tag mismatch'));
      return Promise.resolve(new Uint8Array(p.reverse()));
    },
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
    getItemAsync: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItemAsync: (k: string, v: string) => Promise.resolve(void store.set(k, v)),
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  return {
    Storage: {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => Promise.resolve(void store.set(k, v)),
      removeItem: (k: string) => Promise.resolve(void store.delete(k)),
    },
  };
});

describe('secureSessionStorage', () => {
  const session = JSON.stringify({ access_token: 'secret-token', refresh_token: 'refresh' });

  it('stores only ciphertext and reads the session back', async () => {
    await secureSessionStorage.setItem('sb-session', session);
    expect(await Storage.getItem('sb-session')).not.toContain('secret-token');
    expect(await secureSessionStorage.getItem('sb-session')).toBe(session);
  });

  it('refuses ciphertext moved to another key and removes it', async () => {
    await secureSessionStorage.setItem('sb-session', session);
    await Storage.setItem('other-key', (await Storage.getItem('sb-session'))!);
    expect(await secureSessionStorage.getItem('other-key')).toBeNull();
    expect(await Storage.getItem('other-key')).toBeNull();
  });

  it('returns null for missing items and removes items on request', async () => {
    expect(await secureSessionStorage.getItem('missing')).toBeNull();
    await secureSessionStorage.setItem('sb-session', session);
    await secureSessionStorage.removeItem('sb-session');
    expect(await secureSessionStorage.getItem('sb-session')).toBeNull();
  });
});
