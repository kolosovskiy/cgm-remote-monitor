import type { IdentityType } from '@prisma/client';
import { prisma } from '../db.js';
import { normalizeEmail, normalizePhone } from '../lib/phone.js';

export type Identity = { type: IdentityType; value: string; label?: string };

export function normalizeIdentity(id: Identity): Identity | null {
  if (id.type === 'PHONE' || id.type === 'WHATSAPP' || id.type === 'VIBER') {
    // Viber и WhatsApp используют телефон как идентификатор, но у Viber ботов это user id.
    if (id.type === 'VIBER' && !/^\+?\d+$/.test(id.value)) return { ...id, value: id.value.trim() };
    const v = normalizePhone(id.value);
    return v ? { ...id, value: v } : null;
  }
  if (id.type === 'EMAIL') {
    const v = normalizeEmail(id.value);
    return v ? { ...id, value: v } : null;
  }
  const v = id.value.trim();
  return v ? { ...id, value: v } : null;
}

/**
 * Находит контакт по любому из идентификаторов. Если не найден — создаёт.
 * Если найден, но часть идентификаторов новая (клиент написал в Telegram с известного телефона),
 * добавляет их к контакту.
 */
export async function resolveContact(opts: { identities: Identity[]; name?: string; companyName?: string }) {
  const ids = opts.identities.map(normalizeIdentity).filter((x): x is Identity => !!x);
  if (ids.length === 0) throw new Error('resolveContact: no usable identities');

  const existing = await prisma.contactIdentity.findFirst({
    where: { OR: ids.map((i) => ({ type: i.type, value: i.value })) },
    include: { contact: { include: { identities: true } } },
  });

  if (existing) {
    const contact = existing.contact;
    const missing = ids.filter((i) => !contact.identities.some((e) => e.type === i.type && e.value === i.value));
    if (missing.length) {
      await prisma.contactIdentity.createMany({
        data: missing.map((m) => ({ contactId: contact.id, type: m.type, value: m.value, label: m.label })),
        skipDuplicates: true,
      });
    }
    if (opts.name && (contact.name === 'Без імені' || !contact.name)) {
      await prisma.contact.update({ where: { id: contact.id }, data: { name: opts.name } });
    }
    return prisma.contact.findUniqueOrThrow({ where: { id: contact.id }, include: { identities: true } });
  }

  return prisma.contact.create({
    data: {
      name: opts.name?.trim() || 'Без імені',
      companyName: opts.companyName,
      identities: { create: ids.map((i) => ({ type: i.type, value: i.value, label: i.label })) },
    },
    include: { identities: true },
  });
}

export async function findContactByIdentity(type: IdentityType, value: string) {
  const n = normalizeIdentity({ type, value });
  if (!n) return null;
  const row = await prisma.contactIdentity.findUnique({
    where: { type_value: { type: n.type, value: n.value } },
    include: { contact: true },
  });
  return row?.contact ?? null;
}
