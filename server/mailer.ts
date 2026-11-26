import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function getTransporter(): Transporter {
  if (!isSmtpConfigured()) {
    throw new Error(
      'SMTP email delivery is not configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in server Secrets.'
    );
  }
  if (!cachedTransporter) {
    const port = Number(process.env.SMTP_PORT ?? '587') || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });
  }
  return cachedTransporter;
}

export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  purpose: 'create_admin' | 'bootstrap_admin' | 'password_reset';
  username?: string;
}): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim();

  const subjectMap: Record<typeof params.purpose, string> = {
    create_admin: 'DMIS Admin Account Verification Code',
    bootstrap_admin: 'DMIS Super Admin Setup Verification Code',
    password_reset: 'DMIS Admin Password Reset Verification Code',
  };

  const titleMap: Record<typeof params.purpose, string> = {
    create_admin: 'Administrator Account Email Verification',
    bootstrap_admin: 'Initial Super Administrator Verification',
    password_reset: 'Administrator Password Reset Request',
  };

  const accountLine = params.username ? `Account username: ${params.username}\n` : '';
  const textBody = [
    `Disaster Management Information System (DMIS)`,
    titleMap[params.purpose],
    '',
    accountLine + `Your 6-digit verification code is: ${params.code}`,
    '',
    'This code expires in 15 minutes and can be used once.',
    'If you did not request this verification, ignore this email and contact your system administrator.',
  ]
    .filter((line, idx) => line !== '' || idx > 0)
    .join('\n');

  await transporter.sendMail({
    from,
    to: params.to,
    subject: subjectMap[params.purpose],
    text: textBody,
  });
}
