export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Transactional email transport. Swap providers by adding an implementation. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
