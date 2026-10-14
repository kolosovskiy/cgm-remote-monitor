import type { Channel, IdentityType } from '@prisma/client';
import { prisma } from '../db.js';
import { events } from '../events.js';
import { resolveContact, type Identity } from './contacts.js';
import { createLead, findOpenLead } from './leads.js';

export type InboundMessage = {
  channel: Channel;
  /** Внешний id чата (chat_id, PSID, email адрес) — ключ диалога */
  externalChatId: string;
  /** Внешний id сообщения для идемпотентности (повторный вебхук не создаст дубль) */
  externalMessageId?: string;
  text: string;
  attachments?: { url: string; name?: string; mime?: string }[];
  identities: Identity[];
  senderName?: string;
  subject?: string;
  createdAt?: Date;
  /** Произвольная метка источника (имя формы, utm) */
  sourceDetail?: string;
  /** Создавать лид, если у контакта нет открытого. По умолчанию да. */
  createLeadIfNone?: boolean;
};

/**
 * Единая точка приёма сообщений из любого канала:
 * контакт -> диалог -> сообщение -> лид (если нет открытого) -> событие message.in
 */
export async function ingestInbound(msg: InboundMessage) {
  if (msg.externalMessageId) {
    const dup = await prisma.message.findUnique({
      where: { channel_externalId: { channel: msg.channel, externalId: msg.externalMessageId } },
    });
    if (dup) return { message: dup, duplicate: true as const };
  }

  const contact = await resolveContact({ identities: msg.identities, name: msg.senderName });

  let lead = await findOpenLead(contact.id);
  let leadCreated = false;
  if (!lead && msg.createLeadIfNone !== false) {
    lead = await createLead({ contactId: contact.id, source: msg.channel, sourceDetail: msg.sourceDetail, title: msg.subject });
    leadCreated = true;
  }

  const conversation = await prisma.conversation.upsert({
    where: { channel_externalId: { channel: msg.channel, externalId: msg.externalChatId } },
    create: { channel: msg.channel, externalId: msg.externalChatId, contactId: contact.id, leadId: lead?.id, subject: msg.subject },
    update: { lastMessageAt: new Date(), unreadCount: { increment: 1 }, ...(lead && { leadId: lead.id }) },
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'IN',
      channel: msg.channel,
      externalId: msg.externalMessageId,
      text: msg.text,
      attachments: msg.attachments ?? [],
      status: 'RECEIVED',
      createdAt: msg.createdAt,
    },
  });

  events.emit('message.in', { messageId: message.id, conversationId: conversation.id, leadId: lead?.id ?? null, contactId: contact.id, leadCreated });
  return { message, contact, lead, conversation, leadCreated, duplicate: false as const };
}

export function identity(type: IdentityType, value: string, label?: string): Identity {
  return { type, value, label };
}
