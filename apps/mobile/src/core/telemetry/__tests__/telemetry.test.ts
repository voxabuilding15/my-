import { AppError } from '@studexa/shared';
import * as Sentry from '@sentry/react-native';

const mockInsert = jest.fn(() => Promise.resolve({ error: null }));

jest.mock('@/core/config/env', () => ({
  env: { sentryDsn: 'https://public@o0.ingest.sentry.io/1', useMocks: false },
}));
jest.mock('@/core/supabase/client', () => ({
  getSupabase: () => ({ from: () => ({ insert: mockInsert }) }),
}));

// eslint-disable-next-line import/first -- the mocks above must be registered first
import { initTelemetry, reportError, setTelemetryUser, shouldReport } from '../telemetry';

const EMAIL = 'amina@example.com';
const QUESTION = 'Explique la photosynthèse page 12';

describe('shouldReport', () => {
  it('ignores outcomes the UI already explains and reports everything else', () => {
    expect(shouldReport(new AppError('quota_exceeded'))).toBe(false);
    expect(shouldReport(new AppError('network'))).toBe(false);
    expect(shouldReport(new AppError('unknown'))).toBe(true);
    expect(shouldReport(new TypeError('x is undefined'))).toBe(true);
  });
});

describe('privacy of crash reports', () => {
  beforeEach(() => jest.clearAllMocks());

  it('configures Sentry without screenshots, PII or unscrubbed events', () => {
    initTelemetry();
    const options = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(options).toMatchObject({
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
    const scrubbed = options.beforeSend({
      user: { id: 'u1', email: EMAIL },
      extra: { question: QUESTION },
      exception: { values: [{ type: 'Error', value: `failed for ${EMAIL}` }] },
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(new RegExp(`${EMAIL}|${QUESTION}`));
    expect(options.beforeBreadcrumb({ category: 'console', message: QUESTION })).toBeNull();
  });

  it('sends neither document content nor emails to Sentry or the internal error log', () => {
    setTelemetryUser('u1');
    const error = new Error(`Failing row contains (u1, ${QUESTION}) for ${EMAIL}`);
    reportError(error, { action: 'chat', message: QUESTION, title: 'Biologie – Amina' });

    const [, hint] = (Sentry.captureException as jest.Mock).mock.calls[0];
    const row = (mockInsert.mock.calls[0] as unknown[])[0];
    for (const payload of [hint, row]) {
      const raw = JSON.stringify(payload);
      expect(raw).not.toContain(QUESTION);
      expect(raw).not.toContain(EMAIL);
      expect(raw).not.toContain('Amina');
    }
    expect(row).toMatchObject({ user_id: 'u1', context: { action: 'chat' } });
  });
});
