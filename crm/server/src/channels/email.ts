import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { ingestInbound } from '../services/inbound.js';
import type { ChannelAdapter } from './types.js';

/**
 * Почта: входящие через IMAP (опрос каждые IMAP_POLL_SECONDS), исходящие через SMTP.
 * Диалог = адрес отправителя. Message-ID письма — ключ идемпотентности.
 * Последний обработанный UID хранится в Setting('email.lastUid'), чтобы не перечитывать ящик.
 */
let timer: NodeJS.Timeout | null = null;
let running = false;

async function poll() {
  if (running) return;
  running = true;
  const client = new ImapFlow({
    host: config.email.imapHost,
    port: config.email.imapPort,
    secure: config.email.imapPort === 993,
    auth: { user: config.email.imapUser, pass: config.email.imapPass },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const setting = await prisma.setting.findUnique({ where: { key: 'email.lastUid' } });
      const lastUid = Number((setting?.value as number | undefined) ?? 0);
      let maxUid = lastUid;
      const range = lastUid > 0 ? `${lastUid + 1}:*` : '1:*';
      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid) continue;
        maxUid = Math.max(maxUid, msg.uid);
        const parsed = await simpleParser(msg.source!);
        const from = parsed.from?.value?.[0];
        if (!from?.address) continue;
        if (from.address.toLowerCase() === config.email.imapUser.toLowerCase()) continue;
        const attachments = parsed.attachments?.map((a) => ({ url: '', name: a.filename, mime: a.contentType })) ?? [];
        await ingestInbound({
          channel: 'EMAIL',
          externalChatId: from.address.toLowerCase(),
          externalMessageId: parsed.messageId ?? `uid:${msg.uid}`,
          text: (parsed.text ?? parsed.html ?? '').toString().trim().slice(0, 20000),
          attachments,
          identities: [{ type: 'EMAIL', value: from.address }],
          senderName: from.name || undefined,
          subject: parsed.subject ?? undefined,
          createdAt: parsed.date ?? undefined,
        });
      }
      if (maxUid !== lastUid) {
        await prisma.setting.upsert({ where: { key: 'email.lastUid' }, create: { key: 'email.lastUid', value: maxUid }, update: { value: maxUid } });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('[email] poll failed', err);
  } finally {
    running = false;
  }
}

export const emailChannel: ChannelAdapter = {
  type: 'EMAIL',
  isConfigured: () => !!config.email.imapHost && !!config.email.smtpHost,
  start() {
    void poll();
    timer = setInterval(() => void poll(), Math.max(15, config.email.pollSeconds) * 1000);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
  async send({ conversation, text, subject }) {
    const transport = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpPort === 465,
      auth: { user: config.email.smtpUser, pass: config.email.smtpPass },
    });
    const info = await transport.sendMail({
      from: config.email.from || config.email.smtpUser,
      to: conversation.externalId,
      subject: subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : 'Ответ на ваше обращение',
      text,
    });
    return { externalId: info.messageId };
  },
};
