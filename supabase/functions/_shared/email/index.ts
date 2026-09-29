import type { AuthEnv } from '../env.ts';
import { ConsoleEmailSender } from './console.ts';
import { ResendEmailSender } from './resend.ts';
import { WebhookEmailSender } from './webhook.ts';
import type { EmailSender } from './types.ts';

export type { EmailMessage, EmailSender } from './types.ts';
export { codeEmail } from './templates.ts';

export function createEmailSender(env: AuthEnv): EmailSender {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return new ResendEmailSender(env.RESEND_API_KEY ?? '', env.EMAIL_FROM);
    case 'console':
      return new ConsoleEmailSender();
    case 'webhook':
      return new WebhookEmailSender(env.EMAIL_WEBHOOK_URL ?? '');
  }
}
