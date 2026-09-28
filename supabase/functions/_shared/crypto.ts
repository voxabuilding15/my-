import { EMAIL_CODE_LENGTH } from '@studexa/shared';

/** Uniform random numeric code (rejection sampling avoids modulo bias). */
export function generateNumericCode(length = EMAIL_CODE_LENGTH): string {
  const limit = 4_294_967_296 - (4_294_967_296 % 10);
  const digits: string[] = [];
  const buffer = new Uint32Array(1);
  while (digits.length < length) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? limit;
    if (value < limit) digits.push(String(value % 10));
  }
  return digits.join('');
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}
