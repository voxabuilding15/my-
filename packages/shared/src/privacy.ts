/**
 * Privacy filter for everything that leaves the app or backend as diagnostics: crash reports
 * (Sentry), the internal error log and server logs. Personal data and document contents must
 * never appear there, so reports are scrubbed at the last step before sending, whatever
 * produced them.
 *
 * Two layers:
 * - Structured data (`extra`, contexts, breadcrumb data): values under content-bearing keys
 *   (text, prompt, title, email, ...) are dropped outright.
 * - Free text (messages, exception values, URLs): known carriers of personal data are
 *   replaced — emails, tokens and keys, signed-URL parameters, and Postgres error details
 *   that quote whole rows ("Failing row contains (...)").
 *
 * The only identifier kept is the opaque user id, so a report can be matched to an account
 * by staff without revealing who it is.
 */

export const REDACTED = '[redacted]';

const PATTERNS: [RegExp, string][] = [
  // Postgres quotes the entire offending row or key values in constraint errors.
  [/(Failing row contains )\((?:[^()]|\([^()]*\))*\)/g, `$1(${REDACTED})`],
  [/(Key \([^)]*\)=)\((?:[^()]|\([^()]*\))*\)/g, `$1(${REDACTED})`],
  // Stops at a quote or backslash so JSON log lines stay valid.
  [/(DETAIL: )[^"\\\n]*/g, `$1${REDACTED}`],
  // JWTs (Supabase access tokens, signed-upload tokens).
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[jwt]'],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, '$1 [token]'],
  // API keys: Anthropic, Supabase secret keys, RevenueCat, Stripe-style.
  [
    /\b(?:sk-ant-[\w-]{8,}|sb_secret_[\w-]{8,}|sk_(?:live|test)_[\w]{8,}|rk_[\w]{8,}|pa-[\w-]{20,})/g,
    '[key]',
  ],
  // Credentials in URL query strings (signed Storage URLs, OAuth codes).
  [
    /([?&](?:token|access_token|refresh_token|id_token|apikey|api_key|key|sig|signature|code|X-Amz-[\w-]+)=)[^&#\s"']+/gi,
    `$1${REDACTED}`,
  ],
  [/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
];

/** Keys whose values are user content or identity. Matched case-insensitively, exactly. */
const SENSITIVE_KEY =
  /^(?:content|contents|text|texts|input|prompt|question|answer|message|message_text|body|request_body|response_body|data_body|markdown|html|title|name|display_name|full_name|first_name|last_name|email|emails|phone|password|new_password|newpassword|code|token|access_token|refresh_token|id_token|authorization|cookie|cookies|ocr_text|ocrtext|query|search|q|note|notes|snapshot|content_snapshot|cited_text|quote|front|back|explanation|choices|pages|chunks|history|messages|address|ip_address)$/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Removes personal data and credentials from free text, and caps its length. */
export function scrubText(value: string, maxLength = 4000): string {
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

/** Drops the query string and fragment (they can carry tokens or search terms). */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return scrubText(cut === -1 ? url : url.slice(0, cut));
}

/** Deep copy with sensitive keys dropped and every string scrubbed. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 6) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(item, depth + 1);
  }
  return out;
}

type Json = Record<string, unknown>;

export type ScrubbableBreadcrumb = {
  category?: string | undefined;
  message?: string | undefined;
  data?: Json | undefined;
  [key: string]: unknown;
};

/**
 * Breadcrumbs record what happened before a crash. Console output is dropped (it can print
 * anything), request URLs lose their query strings, and bodies are never kept.
 */
export function scrubBreadcrumb<T extends object>(input: T): T | null {
  const breadcrumb = input as ScrubbableBreadcrumb;
  if (breadcrumb.category === 'console') return null;
  const data: Json = {};
  for (const [key, value] of Object.entries(breadcrumb.data ?? {})) {
    if (isSensitiveKey(key)) continue;
    if (/^(?:url|from|to|request_url)$/i.test(key) && typeof value === 'string')
      data[key] = scrubUrl(value);
    else if (/body|payload|params/i.test(key)) continue;
    else data[key] = scrubValue(value, 1);
  }
  return {
    ...breadcrumb,
    ...(breadcrumb.message !== undefined ? { message: scrubText(breadcrumb.message, 300) } : {}),
    ...(breadcrumb.data !== undefined ? { data } : {}),
  } as T;
}

export type ScrubbableEvent = {
  message?: string | { message?: string; formatted?: string } | undefined;
  user?: { id?: string | number | undefined; [key: string]: unknown } | null | undefined;
  request?: Json | undefined;
  extra?: Json | undefined;
  contexts?: Json | undefined;
  tags?: Json | undefined;
  breadcrumbs?: ScrubbableBreadcrumb[] | undefined;
  exception?: { values?: Json[] | undefined } | undefined;
  logentry?: { message?: string; params?: unknown[] } | undefined;
  [key: string]: unknown;
};

/** Sentry `beforeSend` for every platform (app, dashboard, Edge Functions, worker). */
export function scrubEvent<T extends object>(input: T): T {
  const event = input as ScrubbableEvent;
  const out: ScrubbableEvent = { ...event };

  // Only the opaque account id; never email, name, IP or username.
  out.user = event.user?.id !== undefined ? { id: event.user.id } : undefined;
  if (typeof event.message === 'string') out.message = scrubText(event.message);
  else if (event.message) {
    out.message = {
      ...event.message,
      ...(event.message.message ? { message: scrubText(event.message.message) } : {}),
      ...(event.message.formatted ? { formatted: scrubText(event.message.formatted) } : {}),
    };
  }
  if (event.logentry) {
    out.logentry = { message: scrubText(event.logentry.message ?? ''), params: [] };
  }
  if (event.request) {
    const url = typeof event.request.url === 'string' ? scrubUrl(event.request.url) : undefined;
    const method = event.request.method;
    out.request = { ...(url ? { url } : {}), ...(method ? { method } : {}) };
  }
  if (event.extra) out.extra = scrubValue(event.extra) as Json;
  if (event.contexts) out.contexts = scrubContexts(event.contexts);
  if (event.tags) out.tags = scrubValue(event.tags) as Json;
  if (event.breadcrumbs) {
    out.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is ScrubbableBreadcrumb => crumb !== null);
  }
  if (event.exception?.values) {
    out.exception = {
      ...event.exception,
      values: event.exception.values.map((value) => scrubException(value)),
    };
  }
  return out as T;
}

/** Contexts the SDKs fill in about the runtime; everything else is treated as user data. */
const SDK_CONTEXTS = new Set(['os', 'runtime', 'browser', 'app', 'device', 'culture', 'trace']);

function scrubContexts(contexts: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(contexts)) {
    if (SDK_CONTEXTS.has(key) && value && typeof value === 'object') {
      // The device name is often the owner's name ("Amina's Pixel").
      const { name: _name, device_unique_identifier: _id, ...rest } = value as Json;
      out[key] = key === 'device' ? scrubValue(rest, 1) : { ...(value as Json) };
    } else {
      out[key] = scrubValue(value, 1);
    }
  }
  return out;
}

function scrubException(value: Json): Json {
  const out: Json = { ...value };
  if (typeof value.value === 'string') out.value = scrubText(value.value);
  const stacktrace = value.stacktrace as { frames?: Json[] } | undefined;
  if (stacktrace?.frames) {
    // Local variables can hold anything the function was working on.
    out.stacktrace = {
      ...stacktrace,
      frames: stacktrace.frames.map(({ vars: _vars, ...frame }) => frame),
    };
  }
  return out;
}
