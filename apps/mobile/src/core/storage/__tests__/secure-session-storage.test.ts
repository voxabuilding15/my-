import { Storage } from 'expo-sqlite/kv-store';

import { secureSessionStorage } from '../secure-session-storage';

// A stand-in for AES-GCM with the properties the storage relies on: output differs from the
// input, and decryption fails when the key or the additional data differ. Like the native
// module, it rejects string `additionalData` that is not base64 ("bad base-64" on Android),
// which is how a real device failed to save sessions. Its Android `SealedData.fromCombined`
// accepts only bytes (iOS also takes base64 strings), so a string makes every read fail there.
jest.mock('expo-crypto', () => {
  const toBytesKey = (input: unknown): string => {
    if (input instanceof Uint8Array) return Array.from(input).join(',');
    if (typeof input === 'string') {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 !== 0) {
        throw new Error('AES encryption failed: bad base-64');
      }
      return Array.from(Buffer.from(input, 'base64')).join(',');
    }
    throw new Error('unsupported additionalData');
  };
  class FakeKey {
    readonly id: string;
    constructor(mockId: string) {
      this.id = mockId;
    }
    static generate = () => Promise.resolve(new FakeKey('key-1'));
    static import = (encoded: string) => Promise.resolve(new FakeKey(encoded));
    encoded = () => Promise.resolve(this.id);
  }
  class FakeSealed {
    readonly payload: string;
    constructor(mockPayload: string) {
      this.payload = mockPayload;
    }
    static fromCombined = (combined: unknown) => {
      if (!(combined instanceof Uint8Array)) {
        throw new TypeError("Argument 'combined' cannot be cast to type ByteArray");
      }
      return new FakeSealed(Buffer.from(combined).toString('utf8'));
    };
    combined = (format?: string) =>
      Promise.resolve(
        format === 'base64'
          ? Buffer.from(this.payload, 'utf8').toString('base64')
          : new Uint8Array(Buffer.from(this.payload, 'utf8')),
      );
  }
  return {
    AESEncryptionKey: FakeKey,
    AESSealedData: FakeSealed,
    aesEncryptAsync: async (
      plain: Uint8Array,
      key: FakeKey,
      { additionalData }: { additionalData: unknown },
    ) =>
      new FakeSealed(
        JSON.stringify({
          k: key.id,
          a: toBytesKey(additionalData),
          p: Array.from(plain).reverse(),
        }),
      ),
    aesDecryptAsync: async (
      sealed: FakeSealed,
      key: FakeKey,
      { additionalData }: { additionalData: unknown },
    ) => {
      const { k, a, p } = JSON.parse(sealed.payload) as { k: string; a: string; p: number[] };
      if (k !== key.id || a !== toBytesKey(additionalData)) throw new Error('auth tag mismatch');
      return new Uint8Array(p.reverse());
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

  it('saves the real Supabase key name (not base64) and reads the session back', async () => {
    // The key supabase-js uses on device; it contains '-', which is not valid base64.
    await secureSessionStorage.setItem('sb-10-auth-token', session);
    expect(await secureSessionStorage.getItem('sb-10-auth-token')).toBe(session);
  });

  it('rebuilds the sealed data from bytes, as Android requires', async () => {
    // Regression: the stored base64 string went straight to fromCombined, which Android
    // rejects; every read failed, the session was deleted and the user was signed out.
    const crypto = jest.requireMock<{ AESSealedData: { fromCombined: (c: unknown) => unknown } }>(
      'expo-crypto',
    );
    const spy = jest.spyOn(crypto.AESSealedData, 'fromCombined');
    await secureSessionStorage.setItem('sb-10-auth-token', session);
    expect(await secureSessionStorage.getItem('sb-10-auth-token')).toBe(session);
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    spy.mockRestore();
  });

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
