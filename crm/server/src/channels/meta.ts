import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ingestInbound } from '../services/inbound.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter, SendInput } from './types.js';

/**
 * Facebook Messenger и Instagram Direct через Meta Graph API (один вебхук на оба).
 * Настройка в developers.facebook.com:
 *   Webhooks -> Callback URL: {PUBLIC_URL}/webhooks/meta, Verify token: META_VERIFY_TOKEN
 *   Подписки: page -> messages, messaging_postbacks; instagram -> messages
 * Для продакшена нужны App Review (pages_messaging, instagram_manage_messages) и верификация бизнеса.
 */
type MetaEntry = {
  id: string;
  messaging?: {
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: { mid: string; text?: string; attachments?: { type: string; payload: { url?: string } }[]; is_echo?: boolean };
  }[];
};
type MetaBody = { object: 'page' | 'instagram'; entry: MetaEntry[] };

function verifySignature(req: FastifyRequest) {
  const sig = req.headers['x-hub-signature-256'];
  if (!config.meta.appSecret || typeof sig !== 'string') return false;
  const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expected = 'sha256=' + createHmac('sha256', config.meta.appSecret).update(raw).digest('hex');
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function handleBody(body: MetaBody) {
  const channel = body.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
  const idType = channel;
  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      if (!ev.message || ev.message.is_echo) continue;
      const attachments = (ev.message.attachments ?? []).filter((a) => a.payload?.url).map((a) => ({ url: a.payload.url!, mime: a.type }));
      await ingestInbound({
        channel,
        externalChatId: ev.sender.id,
        externalMessageId: ev.message.mid,
        text: ev.message.text ?? (attachments.length ? '[вложение]' : ''),
        attachments,
        identities: [{ type: idType, value: ev.sender.id }],
        createdAt: new Date(ev.timestamp),
      });
    }
  }
}

async function sendViaGraph({ conversation, text }: SendInput) {
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${config.meta.pageAccessToken}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: conversation.externalId }, message: { text }, messaging_type: 'RESPONSE' }),
  });
  const data = (await res.json()) as { message_id?: string; error?: { message: string } };
  if (data.error) throw new Error(`meta: ${data.error.message}`);
  return { externalId: data.message_id };
}

function registerMetaRoutes(app: FastifyInstance) {
  if (app.hasRoute({ method: 'GET', url: '/webhooks/meta' })) return;
  app.get('/webhooks/meta', async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.meta.verifyToken) return reply.send(q['hub.challenge']);
    return reply.code(403).send('forbidden');
  });
  app.post('/webhooks/meta', async (req, reply) => {
    if (!verifySignature(req)) return reply.code(401).send({ error: 'bad signature' });
    await withWebhookLog('meta', req.body, () => handleBody(req.body as MetaBody));
    return 'EVENT_RECEIVED';
  });
}

export const metaChannel: ChannelAdapter = {
  type: 'FACEBOOK',
  isConfigured: () => !!config.meta.pageAccessToken && !!config.meta.appSecret,
  registerRoutes: registerMetaRoutes,
  send: sendViaGraph,
};

export const instagramChannel: ChannelAdapter = {
  type: 'INSTAGRAM',
  isConfigured: () => !!config.meta.pageAccessToken && !!config.meta.appSecret,
  registerRoutes: registerMetaRoutes,
  send: sendViaGraph,
};
