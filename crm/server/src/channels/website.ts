import { z } from 'zod';
import { config } from '../config.js';
import { ingestInbound } from '../services/inbound.js';
import type { Identity } from '../services/contacts.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter } from './types.js';

const formSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  message: z.string().optional(),
  form: z.string().optional(),
  page: z.string().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Формы с сайта. POST /webhooks/website с заголовком X-Webhook-Secret.
 * Лид создаётся всегда, даже без текста: заявка с формы — это уже лид.
 */
export const websiteChannel: ChannelAdapter = {
  type: 'WEBSITE',
  isConfigured: () => !!config.webhookSecret,
  registerRoutes(app) {
    app.post('/webhooks/website', async (req, reply) => {
      const secret = req.headers['x-webhook-secret'] ?? (req.query as Record<string, string>).secret;
      if (!config.webhookSecret || secret !== config.webhookSecret) return reply.code(401).send({ error: 'bad secret' });
      const parsed = formSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
      const f = parsed.data;
      const identities: Identity[] = [];
      if (f.phone) identities.push({ type: 'PHONE', value: f.phone });
      if (f.email) identities.push({ type: 'EMAIL', value: f.email });
      if (identities.length === 0) return reply.code(400).send({ error: 'phone or email required' });

      const text = [f.message, f.fields && Object.entries(f.fields).map(([k, v]) => `${k}: ${String(v)}`).join('\n')]
        .filter(Boolean)
        .join('\n\n');
      const result = await withWebhookLog('website', req.body, () =>
        ingestInbound({
          channel: 'WEBSITE',
          externalChatId: identities[0].value.replace(/\D/g, '') || identities[0].value,
          text: text || `Заявка с формы${f.form ? ` «${f.form}»` : ''}`,
          identities,
          senderName: f.name,
          subject: f.form ? `Форма: ${f.form}` : undefined,
          sourceDetail: [f.form, f.page, f.utm && new URLSearchParams(f.utm).toString()].filter(Boolean).join(' | '),
        }),
      );
      return { ok: true, leadId: result?.lead?.id };
    });
  },
};
