import type { EmailMessage, EmailSender } from './types.ts';

/** Development only (rejected in production by env validation): prints emails to the log. */
export class ConsoleEmailSender implements EmailSender {
  send(message: EmailMessage): Promise<void> {
    console.log(`[dev email] to=${message.to} subject=${message.subject}\n${message.text}`);
    return Promise.resolve();
  }
}
