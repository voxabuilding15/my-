import { parseEnv } from '../env';

const empty = {
  supabaseUrl: undefined,
  supabaseAnonKey: undefined,
  googleWebClientId: undefined,
  googleIosClientId: undefined,
  legalBaseUrl: undefined,
  revenueCatAndroidKey: undefined,
  sentryDsn: undefined,
  forceMocks: undefined,
};

describe('parseEnv', () => {
  it('falls back to mock mode when backend credentials are missing', () => {
    expect(parseEnv(empty).useMocks).toBe(true);
    expect(parseEnv({ ...empty, supabaseUrl: '', supabaseAnonKey: '  ' }).useMocks).toBe(true);
  });

  it('uses the real backend when credentials are present', () => {
    const env = parseEnv({
      ...empty,
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'anon',
    });
    expect(env.useMocks).toBe(false);
  });

  it('honours an explicit mock override', () => {
    const env = parseEnv({
      ...empty,
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'anon',
      forceMocks: 'true',
    });
    expect(env.useMocks).toBe(true);
  });

  it('rejects a malformed Supabase URL', () => {
    expect(() => parseEnv({ ...empty, supabaseUrl: 'not-a-url' })).toThrow();
  });
});
