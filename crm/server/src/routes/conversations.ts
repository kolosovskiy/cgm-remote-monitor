import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { sendMessage, sendToContact } from '../services/outbound.js';
import { listChannels } from '../channels/registry.js';

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /** Общий инбокс: диалоги по убыванию последнего сообщения. */
  app.get('/api/conversations', async (req) => {
    const q = z.object({ unread: z.coerce.boolean().optional(), channel: z.string().optional(), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
    return prisma.conversation.findMany({
      where: { ...(q.unread && { unreadCount: { gt: 0 } }), ...(q.channel && { channel: q.channel as never }) },
      include: { contact: true, lead: { select: { id: true, title: true, ownerId: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
      take: q.limit,
    });
  });

  app.get('/api/conversations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id }, include: { contact: { include: { identities: true } }, lead: true, messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } } } });
    if (conv.unreadCount > 0) await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    return conv;
  });

  app.post('/api/conversations/:id/messages', async (req) => {
    const { id } = req.params as { id: string };
    const { text, subject } = z.object({ text: z.string().min(1), subject: z.string().optional() }).parse(req.body);
    return sendMessage({ conversationId: id, text, subject, authorId: req.user.id });
  });

  /** Написать контакту в канал, где диалога ещё нет. */
  app.post('/api/contacts/:id/messages', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ channel: z.enum(['EMAIL', 'TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM']), text: z.string().min(1), subject: z.string().optional(), leadId: z.string().optional() }).parse(req.body);
    return sendToContact({ contactId: id, ...body, authorId: req.user.id });
  });

  app.get('/api/channels', async () => listChannels());
}
