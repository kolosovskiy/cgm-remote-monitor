import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest } from '../lib/errors.js';

export async function pipelineRoutes(app: FastifyInstance) {
  app.get('/api/pipelines', { preHandler: app.authenticate }, async () =>
    prisma.pipeline.findMany({ include: { stages: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } }),
  );

  app.post('/api/pipelines', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const body = z.object({ name: z.string().min(1), isDefault: z.boolean().optional(), stages: z.array(z.object({ name: z.string().min(1), color: z.string().optional() })).min(1).optional() }).parse(req.body);
    const count = await prisma.pipeline.count();
    if (body.isDefault) await prisma.pipeline.updateMany({ data: { isDefault: false } });
    const stages: { name: string; color?: string; won?: boolean; lost?: boolean }[] = body.stages ?? [{ name: 'Новая заявка' }, { name: 'В работе' }, { name: 'Успешно', won: true }, { name: 'Отказ', lost: true }];
    return prisma.pipeline.create({
      data: {
        name: body.name,
        position: count,
        isDefault: body.isDefault ?? count === 0,
        stages: { create: stages.map((s, i) => ({ name: s.name, position: i, color: s.color ?? '#6b7280', isWon: !!s.won, isLost: !!s.lost })) },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
  });

  app.patch('/api/pipelines/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).optional(), isDefault: z.boolean().optional(), position: z.number().optional() }).parse(req.body);
    if (body.isDefault) await prisma.pipeline.updateMany({ data: { isDefault: false } });
    return prisma.pipeline.update({ where: { id }, data: body, include: { stages: { orderBy: { position: 'asc' } } } });
  });

  app.delete('/api/pipelines/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const leads = await prisma.lead.count({ where: { pipelineId: id } });
    if (leads > 0) throw badRequest(`В воронке ${leads} лидов, сначала перенесите их`);
    await prisma.pipeline.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/api/pipelines/:id/stages', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1), color: z.string().optional(), isWon: z.boolean().optional(), isLost: z.boolean().optional() }).parse(req.body);
    const count = await prisma.stage.count({ where: { pipelineId: id } });
    return prisma.stage.create({ data: { ...body, pipelineId: id, position: count } });
  });

  app.patch('/api/stages/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).optional(), color: z.string().optional(), isWon: z.boolean().optional(), isLost: z.boolean().optional(), position: z.number().optional() }).parse(req.body);
    return prisma.stage.update({ where: { id }, data: body });
  });

  app.put('/api/pipelines/:id/stages/order', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const { stageIds } = z.object({ stageIds: z.array(z.string()) }).parse(req.body);
    await prisma.$transaction(stageIds.map((sid, i) => prisma.stage.update({ where: { id: sid, pipelineId: id }, data: { position: i } })));
    return prisma.stage.findMany({ where: { pipelineId: id }, orderBy: { position: 'asc' } });
  });

  app.delete('/api/stages/:id', { preHandler: app.requirePerm('settings.manage') }, async (req) => {
    const { id } = req.params as { id: string };
    const leads = await prisma.lead.count({ where: { stageId: id } });
    if (leads > 0) throw badRequest(`На этапе ${leads} лидов, сначала перенесите их`);
    await prisma.stage.delete({ where: { id } });
    return { ok: true };
  });
}
