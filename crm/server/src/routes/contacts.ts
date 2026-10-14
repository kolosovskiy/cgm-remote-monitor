import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { normalizeIdentity, resolveContact } from '../services/contacts.js';
import { badRequest, notFound } from '../lib/errors.js';

const identitySchema = z.object({ type: z.enum(['PHONE', 'EMAIL', 'TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM']), value: z.string().min(1), label: z.string().optional() });

export async function contactRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/contacts', async (req) => {
    const q = z.object({ search: z.string().optional(), page: z.coerce.number().default(1), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
    const where = q.search
      ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { companyName: { contains: q.search, mode: 'insensitive' as const } }, { identities: { some: { value: { contains: q.search.replace(/[\s()+-]/g, '') } } } }] }
      : {};
    const [items, total] = await Promise.all([
      prisma.contact.findMany({ where, include: { identities: true, _count: { select: { leads: true } } }, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.contact.count({ where }),
    ]);
    return { items, total };
  });

  app.get('/api/contacts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const c = await prisma.contact.findUnique({ where: { id }, include: { identities: true, leads: { include: { stage: true, owner: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }, conversations: true, calls: { orderBy: { startedAt: 'desc' }, take: 50 } } });
    if (!c) throw notFound('Контакт не найден');
    return c;
  });

  app.post('/api/contacts', async (req) => {
    const body = z.object({ name: z.string().min(1), companyName: z.string().optional(), identities: z.array(identitySchema).min(1), customFields: z.record(z.string(), z.unknown()).optional() }).parse(req.body);
    const contact = await resolveContact({ identities: body.identities, name: body.name, companyName: body.companyName });
    if (body.customFields) await prisma.contact.update({ where: { id: contact.id }, data: { customFields: body.customFields as object } });
    return contact;
  });

  app.patch('/api/contacts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).optional(), companyName: z.string().nullable().optional(), customFields: z.record(z.string(), z.unknown()).optional() }).parse(req.body);
    return prisma.contact.update({ where: { id }, data: { ...body, customFields: body.customFields as object | undefined }, include: { identities: true } });
  });

  app.post('/api/contacts/:id/identities', async (req) => {
    const { id } = req.params as { id: string };
    const body = identitySchema.parse(req.body);
    const n = normalizeIdentity(body);
    if (!n) throw badRequest('Некорректное значение');
    const exists = await prisma.contactIdentity.findUnique({ where: { type_value: { type: n.type, value: n.value } } });
    if (exists && exists.contactId !== id) throw badRequest('Этот идентификатор уже привязан к другому контакту');
    if (exists) return exists;
    return prisma.contactIdentity.create({ data: { contactId: id, type: n.type, value: n.value, label: n.label } });
  });

  app.delete('/api/contacts/:id/identities/:identityId', async (req) => {
    const { identityId } = req.params as { identityId: string };
    await prisma.contactIdentity.delete({ where: { id: identityId } });
    return { ok: true };
  });

  /** Объединение дублей: все данные second переносятся в first, second удаляется. */
  app.post('/api/contacts/:id/merge', { preHandler: app.requirePerm('contacts.merge') }, async (req) => {
    const { id } = req.params as { id: string };
    const { otherId } = z.object({ otherId: z.string() }).parse(req.body);
    if (id === otherId) throw badRequest('Нельзя объединить контакт с самим собой');
    await prisma.$transaction([
      prisma.contactIdentity.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.lead.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.conversation.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.call.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.task.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.note.updateMany({ where: { contactId: otherId }, data: { contactId: id } }),
      prisma.contact.delete({ where: { id: otherId } }),
    ]);
    return prisma.contact.findUnique({ where: { id }, include: { identities: true } });
  });
}
