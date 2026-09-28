/** Provider-independent failure kinds, mapped to client error codes by the caller. */
export type AiFailureKind =
  | 'refused'
  | 'overloaded'
  | 'rate_limited'
  | 'invalid_request'
  | 'auth'
  | 'network'
  | 'invalid_output';

export class AiError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    message: string,
    /** Whether retrying the same request later can succeed. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
