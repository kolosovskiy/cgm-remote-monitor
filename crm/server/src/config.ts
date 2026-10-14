import 'dotenv/config';

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

export const config = {
  port: Number(env('PORT', '3000')),
  jwtSecret: env('JWT_SECRET', 'dev-secret'),
  publicUrl: env('PUBLIC_URL', 'http://localhost:3000'),
  webhookSecret: env('WEBHOOK_SECRET', ''),
  telegram: { botToken: env('TELEGRAM_BOT_TOKEN') },
  binotel: { key: env('BINOTEL_KEY'), secret: env('BINOTEL_SECRET') },
  meta: {
    verifyToken: env('META_VERIFY_TOKEN'),
    appSecret: env('META_APP_SECRET'),
    pageAccessToken: env('META_PAGE_ACCESS_TOKEN'),
  },
  whatsapp: {
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
  },
  viber: { authToken: env('VIBER_AUTH_TOKEN'), botName: env('VIBER_BOT_NAME', 'CRM') },
  email: {
    imapHost: env('IMAP_HOST'),
    imapPort: Number(env('IMAP_PORT', '993')),
    imapUser: env('IMAP_USER'),
    imapPass: env('IMAP_PASS'),
    pollSeconds: Number(env('IMAP_POLL_SECONDS', '60')),
    smtpHost: env('SMTP_HOST'),
    smtpPort: Number(env('SMTP_PORT', '465')),
    smtpUser: env('SMTP_USER'),
    smtpPass: env('SMTP_PASS'),
    from: env('SMTP_FROM'),
  },
};
