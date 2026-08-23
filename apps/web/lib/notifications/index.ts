import { prisma, type Prisma } from "@bingo/db";
import { getEnv } from "../env";
import { MockNotificationProvider } from "./provider";
import type { EmailProvider, SmsProvider } from "./provider";
import { SmtpEmailProvider } from "./email";
import { MockSmsProvider } from "./sms";

let emailProvider: EmailProvider | undefined;
let smsProvider: SmsProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (emailProvider) return emailProvider;
  const env = getEnv();
  emailProvider = env.SMTP_HOST ? new SmtpEmailProvider() : new MockNotificationProvider();
  return emailProvider;
}

export function getSmsProvider(): SmsProvider {
  if (smsProvider) return smsProvider;
  const env = getEnv();
  // SMS_PROVIDER is intentionally a closed enum today ("mock" only) — a real
  // Ethiopian gateway gets added here as another case once selected.
  smsProvider = env.SMS_PROVIDER === "mock" ? new MockSmsProvider() : new MockSmsProvider();
  return smsProvider;
}

/**
 * Creates an in-app Notification row. Real-time delivery over WebSocket is
 * wired up in Phase 9; for now this makes the notification available via
 * GET /api/notifications and is the single place every "notify the user"
 * call site should go through.
 */
export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      channel: "IN_APP",
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
