import { prisma } from '../db.js';
import { config } from '../config.js';
import { events } from '../events.js';
import { normalizePhone } from '../lib/phone.js';
import { resolveContact } from '../services/contacts.js';
import { createLead, findOpenLead } from '../services/leads.js';
import { withWebhookLog } from './_log.js';
import type { ChannelAdapter } from './types.js';

type BinotelPayload = Record<string, string | undefined>;

/**
 * Binotel. В кабинете Binotel настраиваются Webhooks (раздел «Интеграции → API»):
 *   - «Завершение звонка» (callCompleted) -> POST {PUBLIC_URL}/webhooks/binotel/call-completed
 *   - «Входящий звонок»  (incoming)       -> POST {PUBLIC_URL}/webhooks/binotel/incoming (всплывающая карточка)
 * Binotel шлёт form-urlencoded. Поля (по документации Binotel API 4.0):
 *   requestType, generalCallID, callType (0 входящий, 1 исходящий), internalNumber, externalNumber,
 *   startTime (unix), billsec, waitsec, disposition (ANSWER, BUSY, CANCEL, NOANSWER...),
 *   linkToCallRecord (если включена запись), customerData.
 * Авторизация вебхука: Binotel может подписывать запросы; здесь проверяем секрет в query (?secret=)
 * — простой и надёжный способ, который поддерживается при настройке URL в кабинете.
 */
export const binotelChannel: ChannelAdapter = {
  type: 'PHONE',
  isConfigured: () => !!config.binotel.key && !!config.binotel.secret,
  registerRoutes(app) {
    const guard = (query: unknown) => {
      const q = query as Record<string, string>;
      return !!config.webhookSecret && q.secret === config.webhookSecret;
    };

    app.post('/webhooks/binotel/call-completed', async (req, reply) => {
      if (!guard(req.query)) return reply.code(401).send({ error: 'bad secret' });
      await withWebhookLog('binotel', req.body, () => handleCallCompleted(req.body as BinotelPayload));
      return { ok: true };
    });

    // Входящий звонок: ничего не пишем в БД, просто отдаём данные о клиенте для всплывающей карточки.
    app.post('/webhooks/binotel/incoming', async (req, reply) => {
      if (!guard(req.query)) return reply.code(401).send({ error: 'bad secret' });
      const body = req.body as BinotelPayload;
      const phone = normalizePhone(body.externalNumber);
      if (!phone) return { ok: true };
      const ident = await prisma.contactIdentity.findUnique({ where: { type_value: { type: 'PHONE', value: phone } }, include: { contact: true } });
      const lead = ident ? await findOpenLead(ident.contactId) : null;
      return { ok: true, contact: ident?.contact ?? null, leadId: lead?.id ?? null, url: lead ? `${config.publicUrl}/leads/${lead.id}` : null };
    });
  },
};

export async function handleCallCompleted(body: BinotelPayload) {
  const externalId = body.generalCallID ?? body.callID;
  if (!externalId) throw new Error('binotel: no generalCallID');
  const phone = normalizePhone(body.externalNumber);
  if (!phone) throw new Error('binotel: bad externalNumber');

  const direction = body.callType === '1' ? 'OUT' : 'IN';
  const disposition = (body.disposition ?? '').toUpperCase();
  const status = disposition === 'ANSWER' || disposition === 'ANSWERED' ? 'ANSWERED' : disposition === 'BUSY' ? 'BUSY' : disposition === 'CANCEL' || disposition === 'NOANSWER' ? 'MISSED' : 'FAILED';

  const contact = await resolveContact({ identities: [{ type: 'PHONE', value: phone }] });
  let lead = await findOpenLead(contact.id);
  // Входящий звонок от нового контакта — это заявка. Пропущенный тоже: по нему надо перезвонить.
  if (!lead && direction === 'IN') {
    lead = await createLead({ contactId: contact.id, source: 'PHONE', sourceDetail: body.internalNumber ? `Binotel ${body.internalNumber}` : 'Binotel' });
  }
  const user = body.internalNumber ? await prisma.user.findFirst({ where: { binotelInternal: body.internalNumber } }) : null;

  const call = await prisma.call.upsert({
    where: { externalId },
    create: {
      externalId,
      contactId: contact.id,
      leadId: lead?.id,
      userId: user?.id,
      direction,
      phone,
      internal: body.internalNumber,
      status,
      durationSec: Number(body.billsec ?? 0),
      waitSec: Number(body.waitsec ?? 0),
      recordingUrl: body.linkToCallRecord || undefined,
      startedAt: body.startTime ? new Date(Number(body.startTime) * 1000) : new Date(),
    },
    update: { recordingUrl: body.linkToCallRecord || undefined, status, durationSec: Number(body.billsec ?? 0) },
  });

  const payload = { callId: call.id, leadId: lead?.id ?? null, contactId: contact.id };
  events.emit('call.finished', payload);
  if (status === 'MISSED' && direction === 'IN') events.emit('call.missed', payload);
  return call;
}
