import { config } from '../config.js';
import { ingestInbound } from '../services/inbound.js';
import type { Identity } from '../services/contacts.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter } from './types.js';

const api = (method: string) => `https://api.telegram.org/bot${config.telegram.botToken}/${method}`;

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    contact?: { phone_number: string; first_name?: string; last_name?: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    photo?: { file_id: string }[];
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
};

/**
 * Telegram Bot API через вебхук. После деплоя один раз вызвать:
 *   POST /webhooks/telegram/setup  (с правами админа) — регистрирует {PUBLIC_URL}/webhooks/telegram
 * Клиент пишет боту, сообщение попадает в CRM; ответ менеджера уходит через sendMessage.
 * Если клиент делится контактом (кнопка «Поделиться номером»), телефон привязывается к контакту,
 * и Telegram-диалог склеивается с существующим лидом по телефону.
 */
export const telegramChannel: ChannelAdapter = {
  type: 'TELEGRAM',
  isConfigured: () => !!config.telegram.botToken,
  registerRoutes(app) {
    app.post('/webhooks/telegram', async (req, reply) => {
      const token = req.headers['x-telegram-bot-api-secret-token'];
      if (!config.webhookSecret || token !== config.webhookSecret) return reply.code(401).send({ error: 'bad secret' });
      await withWebhookLog('telegram', req.body, () => handleUpdate(req.body as TgUpdate));
      return { ok: true };
    });

    app.post('/webhooks/telegram/setup', { preHandler: app.requireAdmin }, async () => {
      const res = await fetch(api('setWebhook'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `${config.publicUrl}/webhooks/telegram`, secret_token: config.webhookSecret, allowed_updates: ['message'] }),
      });
      return res.json();
    });
  },
  async send({ conversation, text }) {
    const res = await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: conversation.externalId, text }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!data.ok) throw new Error(`telegram: ${data.description}`);
    return { externalId: `${conversation.externalId}:${data.result?.message_id}` };
  },
};

async function handleUpdate(u: TgUpdate) {
  const m = u.message;
  if (!m || !m.from) return;
  const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || m.from.username || undefined;
  const identities: Identity[] = [{ type: 'TELEGRAM', value: String(m.from.id), label: m.from.username ? `@${m.from.username}` : undefined }];
  if (m.contact?.phone_number) identities.push({ type: 'PHONE', value: m.contact.phone_number });

  const attachments: { url: string; name?: string; mime?: string }[] = [];
  const fileId = m.document?.file_id ?? m.photo?.[m.photo.length - 1]?.file_id;
  if (fileId) {
    const url = await resolveFileUrl(fileId).catch(() => null);
    if (url) attachments.push({ url, name: m.document?.file_name, mime: m.document?.mime_type });
  }

  await ingestInbound({
    channel: 'TELEGRAM',
    externalChatId: String(m.chat.id),
    externalMessageId: `${m.chat.id}:${m.message_id}`,
    text: m.text ?? m.caption ?? (m.contact ? `Поделился номером ${m.contact.phone_number}` : attachments.length ? '[вложение]' : ''),
    attachments,
    identities,
    senderName: name,
    createdAt: new Date(m.date * 1000),
  });
}

async function resolveFileUrl(fileId: string) {
  const res = await fetch(api('getFile') + `?file_id=${encodeURIComponent(fileId)}`);
  const data = (await res.json()) as { ok: boolean; result?: { file_path: string } };
  if (!data.ok || !data.result) return null;
  return `https://api.telegram.org/file/bot${config.telegram.botToken}/${data.result.file_path}`;
}
