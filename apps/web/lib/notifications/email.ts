import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailProvider } from "./provider";
import { getEnv } from "../env";

/** SMTP-compatible email provider — works with any standard SMTP relay. */
export class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor() {
    const env = getEnv();
    this.from = env.SMTP_FROM ?? "no-reply@example.com";
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
