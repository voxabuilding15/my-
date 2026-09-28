import { AppError } from '@studexa/shared';

import { shouldReport } from '../telemetry';

describe('shouldReport', () => {
  it('ignores outcomes the UI already explains and reports everything else', () => {
    expect(shouldReport(new AppError('quota_exceeded'))).toBe(false);
    expect(shouldReport(new AppError('network'))).toBe(false);
    expect(shouldReport(new AppError('unknown'))).toBe(true);
    expect(shouldReport(new TypeError('x is undefined'))).toBe(true);
  });
});
