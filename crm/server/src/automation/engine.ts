import type { Channel } from '@prisma/client';
import { prisma } from '../db.js';
import { events, type DomainEvents } from '../events.js';
import { assignLead, moveLead, pickOwnerRoundRobin } from '../services/leads.js';
import { sendMessage, sendToContact } from '../services/outbound.js';

/**
 * Автоматизации. Правило хранится в БД (model Automation):
 *   trigger:    одно из событий ниже
 *   conditions: [{ field, op, value }] — все должны выполниться (AND)
 *   actions:    [{ type, ...params }]  — выполняются по порядку
 *
 * Контекст (ctx) собирается из события: lead, contact, message, call. Поля в условиях
 * адресуются путями: "lead.source", "lead.stageId", "contact.customFields.city", "message.text".
 */
export const TRIGGERS = ['lead.created', 'lead.stage_changed', 'lead.assigned', 'message.in', 'call.finished', 'call.missed', 'task.overdue'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export type Condition = { field: string; op: 'eq' | 'neq' | 'contains' | 'in' | 'empty' | 'not_empty' | 'gt' | 'lt'; value?: unknown };

export type Action =
  | { type: 'assign_round_robin'; userIds?: string[] }
  | { type: 'assign_user'; userId: string }
  | { type: 'move_stage'; stageId: string }
  | { type: 'reply_same_channel'; text: string }
  | { type: 'send_message'; channel: Channel; text: string; subject?: string }
  | { type: 'create_task'; title: string; dueInHours?: number; assignToOwner?: boolean }
  | { type: 'add_note'; text: string }
  | { type: 'webhook'; url: string };

export type Context = Record<string, unknown> & {
  lead?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
  message?: Record<string, unknown> | null;
  call?: Record<string, unknown> | null;
};

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export function checkCondition(ctx: Context, c: Condition): boolean {
  const v = getPath(ctx, c.field);
  switch (c.op) {
    case 'eq':
      return String(v ?? '') === String(c.value ?? '');
    case 'neq':
      return String(v ?? '') !== String(c.value ?? '');
    case 'contains':
      return typeof v === 'string' && typeof c.value === 'string' && v.toLowerCase().includes(c.value.toLowerCase());
    case 'in':
      return Array.isArray(c.value) && c.value.map(String).includes(String(v));
    case 'empty':
      return v === undefined || v === null || v === '';
    case 'not_empty':
      return !(v === undefined || v === null || v === '');
    case 'gt':
      return Number(v) > Number(c.value);
    case 'lt':
      return Number(v) < Number(c.value);
    default:
      return false;
  }
}

export function matches(ctx: Context, conditions: Condition[]): boolean {
  return conditions.every((c) => checkCondition(ctx, c));
}

/** Подстановка {{lead.title}}, {{contact.name}} и т.п. в тексты действий. */
export function render(template: string, ctx: Context): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p: string) => {
    const v = getPath(ctx, p);
    return v === undefined || v === null ? '' : String(v);
  });
}

async function buildContext(trigger: Trigger, payload: DomainEvents[keyof DomainEvents]): Promise<Context> {
  const p = payload as Record<string, unknown>;
  const ctx: Context = { trigger, ...p };
  const leadId = (p.leadId as string | null | undefined) ?? undefined;
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: { include: { identities: true } }, stage: true, owner: true } });
    if (lead) {
      ctx.lead = { ...lead, amount: lead.amount ? Number(lead.amount) : null };
      ctx.contact = lead.contact;
    }
  }
  if (!ctx.contact && typeof p.contactId === 'string') ctx.contact = await prisma.contact.findUnique({ where: { id: p.contactId }, include: { identities: true } });
  if (typeof p.messageId === 'string') ctx.message = await prisma.message.findUnique({ where: { id: p.messageId } });
  if (typeof p.callId === 'string') ctx.call = await prisma.call.findUnique({ where: { id: p.callId } });
  if (typeof p.toStageId === 'string') ctx.toStage = await prisma.stage.findUnique({ where: { id: p.toStageId } });
  return ctx;
}

export async function runAction(action: Action, ctx: Context) {
  const leadId = ctx.lead?.id as string | undefined;
  const contactId = (ctx.contact?.id as string | undefined) ?? (ctx.lead?.contactId as string | undefined);
  switch (action.type) {
    case 'assign_round_robin': {
      if (!leadId) return;
      const ownerId = await pickOwnerRoundRobin(action.userIds);
      if (ownerId) await assignLead(leadId, ownerId);
      return;
    }
    case 'assign_user':
      if (leadId) await assignLead(leadId, action.userId);
      return;
    case 'move_stage':
      if (leadId) await moveLead(leadId, action.stageId);
      return;
    case 'reply_same_channel': {
      const conversationId = ctx.message?.conversationId as string | undefined;
      if (conversationId) await sendMessage({ conversationId, text: render(action.text, ctx) });
      return;
    }
    case 'send_message':
      if (contactId && action.channel !== 'PHONE' && action.channel !== 'WEBSITE' && action.channel !== 'MANUAL') {
        await sendToContact({ contactId, channel: action.channel, text: render(action.text, ctx), subject: action.subject && render(action.subject, ctx), leadId });
      }
      return;
    case 'create_task':
      await prisma.task.create({
        data: {
          title: render(action.title, ctx),
          leadId,
          contactId,
          assigneeId: action.assignToOwner ? ((ctx.lead?.ownerId as string | null) ?? null) : null,
          dueAt: action.dueInHours ? new Date(Date.now() + action.dueInHours * 3600_000) : null,
        },
      });
      return;
    case 'add_note':
      if (leadId || contactId) await prisma.note.create({ data: { text: render(action.text, ctx), leadId, contactId } });
      return;
    case 'webhook':
      await fetch(action.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ctx) });
      return;
  }
}

export async function runAutomations(trigger: Trigger, payload: DomainEvents[keyof DomainEvents]) {
  const rules = await prisma.automation.findMany({ where: { trigger, enabled: true }, orderBy: { position: 'asc' } });
  if (rules.length === 0) return;
  let ctx = await buildContext(trigger, payload);
  for (const rule of rules) {
    if (!matches(ctx, rule.conditions as Condition[])) continue;
    for (const action of rule.actions as Action[]) {
      try {
        await runAction(action, ctx);
        // Действия могут поменять лид (владелец, этап) — обновляем контекст для следующих.
        ctx = await buildContext(trigger, payload);
      } catch (err) {
        console.error(`[automation] ${rule.name}: action ${action.type} failed`, err);
      }
    }
  }
}

export function startAutomationEngine() {
  for (const t of TRIGGERS) {
    events.on(t, (payload) => runAutomations(t, payload));
  }
}

/** Проверка просроченных задач раз в минуту: публикует task.overdue один раз на задачу. */
const notifiedOverdue = new Set<string>();
export function startOverdueWatcher() {
  return setInterval(async () => {
    const tasks = await prisma.task.findMany({ where: { doneAt: null, dueAt: { lt: new Date() } }, select: { id: true } });
    for (const t of tasks) {
      if (notifiedOverdue.has(t.id)) continue;
      notifiedOverdue.add(t.id);
      events.emit('task.overdue', { taskId: t.id });
    }
  }, 60_000);
}
