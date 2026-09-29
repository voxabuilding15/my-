import type { EmailMessage, EmailSender } from './types.ts';

/**
 * Development and automated tests only (rejected in production by env validation): posts each
 * email as JSON to a local inbox, so tests can read verification codes.
 */
export class WebhookEmailSender implements EmailSender {
  constructor(private readonly url: string) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`email webhook failed: ${res.status}`);
    await res.body?.cancel();
  }
}
