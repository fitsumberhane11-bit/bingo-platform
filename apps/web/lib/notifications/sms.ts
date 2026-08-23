import type { SmsMessage, SmsProvider } from "./provider";

/**
 * Development/test SMS provider — logs instead of sending. Swap in a real
 * Ethiopian SMS gateway later by implementing `SmsProvider` and wiring it
 * into `getSmsProvider()` in `index.ts`; nothing in the auth flow needs to
 * change since it only depends on this interface.
 */
export class MockSmsProvider implements SmsProvider {
  async sendSms(message: SmsMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[MOCK SMS] to=${message.to}: ${message.body}`);
  }
}
