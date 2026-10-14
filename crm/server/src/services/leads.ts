import type { Channel, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { events } from '../events.js';
import { badRequest, notFound } from '../lib/errors.js';

export async function getDefaultPipeline() {
  const p =
    (await prisma.pipeline.findFirst({ where: { isDefault: true }, include: { stages: { orderBy: { position: 'asc' } } } })) ??
    (await prisma.pipeline.findFirst({ orderBy: { position: 'asc' }, include: { stages: { orderBy: { position: 'asc' } } } }));
  if (!p || p.stages.length === 0) throw new Error('Нет воронки с этапами. Запустите db:seed или создайте воронку.');
  return p;
}

export async function createLead(input: {
  title?: string;
  contactId: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string | null;
  source?: Channel;
  sourceDetail?: string;
  amount?: number | null;
  customFields?: Prisma.InputJsonValue;
  userId?: string;
}) {
  let pipelineId = input.pipelineId;
  let stageId = input.stageId;
  if (!pipelineId || !stageId) {
    const p = await getDefaultPipeline();
    pipelineId = pipelineId ?? p.id;
    if (!stageId) {
      const pl = pipelineId === p.id ? p : await prisma.pipeline.findUniqueOrThrow({ where: { id: pipelineId }, include: { stages: { orderBy: { position: 'asc' } } } });
      stageId = pl.stages[0]?.id;
      if (!stageId) throw badRequest('В воронке нет этапов');
    }
  }
  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact) throw notFound('Контакт не найден');

  const lead = await prisma.lead.create({
    data: {
      title: input.title?.trim() || `Заявка: ${contact.name}`,
      contactId: input.contactId,
      pipelineId,
      stageId,
      ownerId: input.ownerId ?? null,
      source: input.source ?? 'MANUAL',
      sourceDetail: input.sourceDetail,
      amount: input.amount ?? null,
      customFields: input.customFields ?? {},
      stageHistory: { create: { toStage: stageId, userId: input.userId } },
    },
  });
  events.emit('lead.created', { leadId: lead.id });
  return lead;
}

/** Открытый лид контакта в воронке по умолчанию, чтобы не плодить дубликаты на каждое сообщение. */
export async function findOpenLead(contactId: string) {
  return prisma.lead.findFirst({ where: { contactId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
}

export async function moveLead(leadId: string, stageId: string, userId?: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw notFound('Лид не найден');
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw notFound('Этап не найден');
  if (stage.id === lead.stageId) return lead;

  const status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN';
  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      stageId,
      pipelineId: stage.pipelineId,
      status,
      closedAt: status === 'OPEN' ? null : new Date(),
      stageHistory: { create: { fromStage: lead.stageId, toStage: stageId, userId } },
    },
  });
  events.emit('lead.stage_changed', { leadId, fromStageId: lead.stageId, toStageId: stageId, userId });
  return updated;
}

export async function assignLead(leadId: string, ownerId: string | null) {
  const updated = await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });
  events.emit('lead.assigned', { leadId, ownerId });
  return updated;
}

/** Круговое распределение: менеджер с наименьшим числом открытых лидов. */
export async function pickOwnerRoundRobin(candidateIds?: string[]) {
  const users = await prisma.user.findMany({
    where: { isActive: true, ...(candidateIds?.length ? { id: { in: candidateIds } } : {}) },
    select: { id: true, _count: { select: { leads: { where: { status: 'OPEN' } } } } },
  });
  if (users.length === 0) return null;
  users.sort((a, b) => a._count.leads - b._count.leads);
  return users[0].id;
}
