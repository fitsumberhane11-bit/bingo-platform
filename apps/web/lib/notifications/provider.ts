export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
}

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SmsProvider {
  sendSms(message: SmsMessage): Promise<void>;
}

/**
 * Logs instead of sending — used in development, and as the required
 * fallback so a missing SMTP/SMS config never crashes the request path.
 */
export class MockNotificationProvider implements EmailProvider, SmsProvider {
  async sendEmail(message: EmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[MOCK EMAIL] to=${message.to} subject="${message.subject}"\n${message.text ?? message.html}`);
  }

  async sendSms(message: SmsMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[MOCK SMS] to=${message.to}: ${message.body}`);
  }
}
