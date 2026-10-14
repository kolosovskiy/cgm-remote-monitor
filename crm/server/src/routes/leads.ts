import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assignLead, createLead, moveLead } from '../services/leads.js';
import { forbidden, notFound } from '../lib/errors.js';
import { can } from '../lib/permissions.js';

const leadInclude = {
  contact: { include: { identities: true } },
  stage: true,
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: { where: { doneAt: null } }, conversations: true } },
} as const;

export async function leadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/leads', async (req) => {
    const q = z.object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      ownerId: z.string().optional(),
      status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
      source: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(500).default(200),
    }).parse(req.query);
    const where = {
      ...(q.pipelineId && { pipelineId: q.pipelineId }),
      ...(q.stageId && { stageId: q.stageId }),
      ...(q.ownerId && { ownerId: q.ownerId }),
      ...(q.status && { status: q.status }),
      ...(q.source && { source: q.source as never }),
      ...(q.search && { OR: [{ title: { contains: q.search, mode: 'insensitive' as const } }, { contact: { name: { contains: q.search, mode: 'insensitive' as const } } }, { contact: { identities: { some: { value: { contains: q.search.replace(/[\s()+-]/g, '') } } } } }] }),
    };
    const [items, total] = await Promise.all([
      prisma.lead.findMany({ where, include: leadInclude, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.lead.count({ where }),
    ]);
    return { items, total };
  });

  app.get('/api/leads/:id', async (req) => {
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        ...leadInclude,
        pipeline: { include: { stages: { orderBy: { position: 'asc' } } } },
        conversations: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
        calls: { orderBy: { startedAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
        tasks: { orderBy: { dueAt: 'asc' }, include: { assignee: { select: { id: true, name: true } } } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, name: true } } } },
        stageHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!lead) throw notFound('Лид не найден');
    return lead;
  });

  app.post('/api/leads', async (req) => {
    const body = z.object({
      title: z.string().optional(),
      contactId: z.string(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      ownerId: z.string().nullable().optional(),
      amount: z.number().nullable().optional(),
      sourceDetail: z.string().optional(),
      customFields: z.record(z.string(), z.unknown()).optional(),
    }).parse(req.body);
    const lead = await createLead({ ...body, customFields: body.customFields as object | undefined, source: 'MANUAL', userId: req.user.id, ownerId: body.ownerId === undefined || !can(req.user.role, 'leads.reassign') ? req.user.id : body.ownerId });
    return prisma.lead.findUnique({ where: { id: lead.id }, include: leadInclude });
  });

  app.patch('/api/leads/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      title: z.string().min(1).optional(),
      amount: z.number().nullable().optional(),
      currency: z.string().optional(),
      customFields: z.record(z.string(), z.unknown()).optional(),
      stageId: z.string().optional(),
      ownerId: z.string().nullable().optional(),
    }).parse(req.body);
    const { stageId, ownerId, customFields, ...rest } = body;
    const current = await prisma.lead.findUnique({ where: { id }, select: { ownerId: true } });
    if (!current) throw notFound('Лид не найден');
    if (!can(req.user.role, 'leads.edit_any') && current.ownerId && current.ownerId !== req.user.id) throw forbidden('Можно редактировать только свои лиды');
    if (ownerId !== undefined && !can(req.user.role, 'leads.reassign') && !(current.ownerId === null && ownerId === req.user.id)) throw forbidden('Нет права переназначать лиды');
    await prisma.lead.update({ where: { id }, data: { ...rest, customFields: customFields as object | undefined } });
    if (stageId) await moveLead(id, stageId, req.user.id);
    if (ownerId !== undefined) await assignLead(id, ownerId);
    return prisma.lead.findUnique({ where: { id }, include: leadInclude });
  });

  app.post('/api/leads/:id/notes', async (req) => {
    const { id } = req.params as { id: string };
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    return prisma.note.create({ data: { text, leadId: id, authorId: req.user.id }, include: { author: { select: { id: true, name: true } } } });
  });

  app.delete('/api/leads/:id', { preHandler: app.requirePerm('leads.delete') }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.conversation.updateMany({ where: { leadId: id }, data: { leadId: null } });
    await prisma.call.updateMany({ where: { leadId: id }, data: { leadId: null } });
    await prisma.lead.delete({ where: { id } });
    return { ok: true };
  });
}
