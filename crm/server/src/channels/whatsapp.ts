import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ingestInbound } from '../services/inbound.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter } from './types.js';

/**
 * WhatsApp Business Cloud API (официальный, через Meta).
 * Вебхук: {PUBLIC_URL}/webhooks/whatsapp, verify token общий с Meta (META_VERIFY_TOKEN).
 * Важно: ответить клиенту свободным текстом можно только в течение 24 часов после его сообщения,
 * дальше — только утверждённым шаблоном. Это ограничение WhatsApp, не CRM.
 */
type WaBody = {
  entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string } }[] } }[] }[];
};

function verifySignature(req: FastifyRequest) {
  const sig = req.headers['x-hub-signature-256'];
  if (!config.meta.appSecret || typeof sig !== 'string') return false;
  const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expected = 'sha256=' + createHmac('sha256', config.meta.appSecret).update(raw).digest('hex');
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export const whatsappChannel: ChannelAdapter = {
  type: 'WHATSAPP',
  isConfigured: () => !!config.whatsapp.accessToken && !!config.whatsapp.phoneNumberId,
  registerRoutes(app) {
    app.get('/webhooks/whatsapp', async (req, reply) => {
      const q = req.query as Record<string, string>;
      if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.meta.verifyToken) return reply.send(q['hub.challenge']);
      return reply.code(403).send('forbidden');
    });
    app.post('/webhooks/whatsapp', async (req, reply) => {
      if (!verifySignature(req)) return reply.code(401).send({ error: 'bad signature' });
      await withWebhookLog('whatsapp', req.body, async () => {
        const body = req.body as WaBody;
        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const v = change.value;
            if (!v?.messages) continue;
            for (const m of v.messages) {
              const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
              await ingestInbound({
                channel: 'WHATSAPP',
                externalChatId: m.from,
                externalMessageId: m.id,
                text: m.text?.body ?? `[${m.type}]`,
                identities: [{ type: 'WHATSAPP', value: m.from }, { type: 'PHONE', value: m.from }],
                senderName: name,
                createdAt: new Date(Number(m.timestamp) * 1000),
              });
            }
          }
        }
      });
      return 'EVENT_RECEIVED';
    });
  },
  async send({ conversation, text }) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.whatsapp.accessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: conversation.externalId, type: 'text', text: { body: text } }),
    });
    const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (data.error) throw new Error(`whatsapp: ${data.error.message}`);
    return { externalId: data.messages?.[0]?.id };
  },
};
