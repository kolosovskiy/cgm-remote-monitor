import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ingestInbound } from '../services/inbound.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter } from './types.js';

/**
 * Viber Bot API. После деплоя вызвать POST /webhooks/viber/setup (админ) — регистрирует вебхук.
 * Клиент должен первым написать боту (или подписаться); писать первым бот не может.
 * Для инициированных рассылок нужен Viber Business Messages через партнёра — отдельная интеграция.
 */
type ViberEvent = {
  event: 'message' | 'subscribed' | 'conversation_started' | 'delivered' | 'seen' | 'failed' | 'unsubscribed' | 'webhook';
  timestamp: number;
  message_token: number;
  sender?: { id: string; name?: string };
  user?: { id: string; name?: string };
  message?: { type: string; text?: string; media?: string; file_name?: string };
};

function verify(req: FastifyRequest) {
  const sig = req.headers['x-viber-content-signature'];
  if (!config.viber.authToken || typeof sig !== 'string') return false;
  const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expected = createHmac('sha256', config.viber.authToken).update(raw).digest('hex');
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export const viberChannel: ChannelAdapter = {
  type: 'VIBER',
  isConfigured: () => !!config.viber.authToken,
  registerRoutes(app) {
    app.post('/webhooks/viber', async (req, reply) => {
      if (!verify(req)) return reply.code(401).send({ error: 'bad signature' });
      const ev = req.body as ViberEvent;
      if (ev.event === 'webhook') return { status: 0 };
      if (ev.event === 'message' && ev.sender && ev.message) {
        await withWebhookLog('viber', req.body, () =>
          ingestInbound({
            channel: 'VIBER',
            externalChatId: ev.sender!.id,
            externalMessageId: String(ev.message_token),
            text: ev.message!.text ?? `[${ev.message!.type}]`,
            attachments: ev.message!.media ? [{ url: ev.message!.media, name: ev.message!.file_name }] : [],
            identities: [{ type: 'VIBER', value: ev.sender!.id }],
            senderName: ev.sender!.name,
            createdAt: new Date(ev.timestamp),
          }),
        );
      }
      return { status: 0 };
    });
    app.post('/webhooks/viber/setup', { preHandler: app.requirePerm('integrations.manage') }, async () => {
      const res = await fetch('https://chatapi.viber.com/pa/set_webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Viber-Auth-Token': config.viber.authToken },
        body: JSON.stringify({ url: `${config.publicUrl}/webhooks/viber`, event_types: ['message', 'subscribed', 'conversation_started'], send_name: true }),
      });
      return res.json();
    });
  },
  async send({ conversation, text }) {
    const res = await fetch('https://chatapi.viber.com/pa/send_message', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Viber-Auth-Token': config.viber.authToken },
      body: JSON.stringify({ receiver: conversation.externalId, type: 'text', text, sender: { name: config.viber.botName } }),
    });
    const data = (await res.json()) as { status: number; status_message?: string; message_token?: number };
    if (data.status !== 0) throw new Error(`viber: ${data.status_message}`);
    return { externalId: data.message_token ? String(data.message_token) : undefined };
  },
};
