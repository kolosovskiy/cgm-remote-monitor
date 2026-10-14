import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { TRIGGERS } from '../automation/engine.js';
import { can } from '../lib/permissions.js';

export async function miscRoutes(app: FastifyInstance) {
  // Задачи
  app.get('/api/tasks', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ mine: z.coerce.boolean().optional(), done: z.coerce.boolean().optional() }).parse(req.query);
    return prisma.task.findMany({
      where: { ...(q.mine && { assigneeId: req.user.id }), doneAt: q.done ? { not: null } : null },
      include: { lead: { select: { id: true, title: true } }, contact: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  });
  app.post('/api/tasks', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ title: z.string().min(1), leadId: z.string().optional(), contactId: z.string().optional(), assigneeId: z.string().nullable().optional(), dueAt: z.coerce.date().nullable().optional() }).parse(req.body);
    const assigneeId = body.assigneeId === undefined || !can(req.user.role, 'tasks.assign_others') ? req.user.id : body.assigneeId;
    return prisma.task.create({ data: { ...body, assigneeId } });
  });
  app.patch('/api/tasks/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ title: z.string().optional(), assigneeId: z.string().nullable().optional(), dueAt: z.coerce.date().nullable().optional(), done: z.boolean().optional() }).parse(req.body);
    const { done, ...rest } = body;
    return prisma.task.update({ where: { id }, data: { ...rest, ...(done !== undefined && { doneAt: done ? new Date() : null }) } });
  });

  // Звонки
  app.get('/api/calls', { preHandler: app.authenticate }, async (req) => {
    const q = z.object({ limit: z.coerce.number().max(500).default(100), status: z.string().optional() }).parse(req.query);
    return prisma.call.findMany({ where: q.status ? { status: q.status as never } : {}, include: { contact: true, user: { select: { id: true, name: true } }, lead: { select: { id: true, title: true } } }, orderBy: { startedAt: 'desc' }, take: q.limit });
  });

  // Настраиваемые поля
  app.get('/api/fields', { preHandler: app.authenticate }, async () => prisma.fieldDefinition.findMany({ orderBy: [{ entity: 'asc' }, { position: 'asc' }] }));
  app.post('/api/fields', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const body = z.object({ entity: z.enum(['LEAD', 'CONTACT']), key: z.string().regex(/^[a-z][a-z0-9_]*$/), label: z.string().min(1), type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOL']), options: z.array(z.string()).optional(), required: z.boolean().optional() }).parse(req.body);
    const count = await prisma.fieldDefinition.count({ where: { entity: body.entity } });
    return prisma.fieldDefinition.create({ data: { ...body, options: body.options ?? [], position: count } });
  });
  app.patch('/api/fields/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ label: z.string().optional(), options: z.array(z.string()).optional(), required: z.boolean().optional(), position: z.number().optional() }).parse(req.body);
    return prisma.fieldDefinition.update({ where: { id }, data: body });
  });
  app.delete('/api/fields/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.fieldDefinition.delete({ where: { id } });
    return { ok: true };
  });

  // Автоматизации
  app.get('/api/automations', { preHandler: app.authenticate }, async () => ({ triggers: TRIGGERS, items: await prisma.automation.findMany({ orderBy: { position: 'asc' } }) }));
  const automationSchema = z.object({ name: z.string().min(1), trigger: z.enum(TRIGGERS), conditions: z.array(z.object({ field: z.string(), op: z.string(), value: z.unknown().optional() })).default([]), actions: z.array(z.object({ type: z.string() }).passthrough()).default([]), enabled: z.boolean().default(true) });
  app.post('/api/automations', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const body = automationSchema.parse(req.body);
    const count = await prisma.automation.count();
    return prisma.automation.create({ data: { ...body, conditions: body.conditions as object[], actions: body.actions as object[], position: count } });
  });
  app.patch('/api/automations/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = automationSchema.partial().parse(req.body);
    return prisma.automation.update({ where: { id }, data: { ...body, conditions: body.conditions as object[] | undefined, actions: body.actions as object[] | undefined } });
  });
  app.delete('/api/automations/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.automation.delete({ where: { id } });
    return { ok: true };
  });

  // Шаблоны сообщений
  app.get('/api/templates', { preHandler: app.authenticate }, async () => prisma.messageTemplate.findMany({ orderBy: { name: 'asc' } }));
  app.post('/api/templates', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const body = z.object({ name: z.string().min(1), subject: z.string().optional(), body: z.string().min(1), channel: z.string().optional() }).parse(req.body);
    return prisma.messageTemplate.create({ data: { ...body, channel: body.channel as never } });
  });
  app.delete('/api/templates/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.messageTemplate.delete({ where: { id } });
    return { ok: true };
  });

  // Журнал вебхуков для отладки интеграций
  app.get('/api/webhook-logs', { preHandler: app.requirePerm('integrations.manage') }, async (req) => {
    const q = z.object({ channel: z.string().optional(), errors: z.coerce.boolean().optional(), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
    return prisma.webhookLog.findMany({ where: { ...(q.channel && { channel: q.channel }), ...(q.errors && { error: { not: null } }) }, orderBy: { createdAt: 'desc' }, take: q.limit });
  });

  // Сводка для дашборда
  app.get('/api/stats', { preHandler: app.authenticate }, async () => {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [open, newMonth, wonMonth, lostMonth, missedCalls, unread, bySource] = await Promise.all([
      prisma.lead.count({ where: { status: 'OPEN' } }),
      prisma.lead.count({ where: { createdAt: { gte: since } } }),
      prisma.lead.count({ where: { status: 'WON', closedAt: { gte: since } } }),
      prisma.lead.count({ where: { status: 'LOST', closedAt: { gte: since } } }),
      prisma.call.count({ where: { status: 'MISSED', startedAt: { gte: since } } }),
      prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
      prisma.lead.groupBy({ by: ['source'], where: { createdAt: { gte: since } }, _count: true }),
    ]);
    return { open, newMonth, wonMonth, lostMonth, missedCalls, unread, bySource: bySource.map((s) => ({ source: s.source, count: s._count })) };
  });
}
