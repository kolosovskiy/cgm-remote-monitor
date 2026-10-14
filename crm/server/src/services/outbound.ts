import { prisma } from '../db.js';
import { events } from '../events.js';
import { getChannel } from '../channels/registry.js';
import { badRequest, notFound } from '../lib/errors.js';

/** Отправка сообщения в существующий диалог через адаптер его канала. */
export async function sendMessage(opts: { conversationId: string; text: string; authorId?: string; subject?: string }) {
  const conversation = await prisma.conversation.findUnique({ where: { id: opts.conversationId }, include: { contact: true } });
  if (!conversation) throw notFound('Диалог не найден');
  const adapter = getChannel(conversation.channel);
  if (!adapter?.send) throw badRequest(`Канал ${conversation.channel} не поддерживает отправку`);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      channel: conversation.channel,
      text: opts.text,
      status: 'PENDING',
      authorId: opts.authorId,
    },
  });

  try {
    const res = await adapter.send({ conversation, text: opts.text, subject: opts.subject ?? conversation.subject ?? undefined });
    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { status: 'SENT', externalId: res.externalId },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    events.emit('message.out', { messageId: updated.id, conversationId: conversation.id });
    return updated;
  } catch (err) {
    const e = err as Error;
    return prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED', error: e.message } });
  }
}

/**
 * Отправка контакту в канале, где диалога ещё нет (например, email первому обращению по телефону).
 * Создаёт диалог по идентификатору контакта в этом канале.
 */
export async function sendToContact(opts: { contactId: string; channel: 'EMAIL' | 'TELEGRAM' | 'VIBER' | 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM'; text: string; subject?: string; authorId?: string; leadId?: string }) {
  const identityType = opts.channel === 'EMAIL' ? 'EMAIL' : opts.channel;
  const ident = await prisma.contactIdentity.findFirst({ where: { contactId: opts.contactId, type: identityType } });
  if (!ident) throw badRequest(`У контакта нет идентификатора для канала ${opts.channel}`);
  const conversation = await prisma.conversation.upsert({
    where: { channel_externalId: { channel: opts.channel, externalId: ident.value } },
    create: { channel: opts.channel, externalId: ident.value, contactId: opts.contactId, leadId: opts.leadId, subject: opts.subject },
    update: {},
  });
  return sendMessage({ conversationId: conversation.id, text: opts.text, subject: opts.subject, authorId: opts.authorId });
}
