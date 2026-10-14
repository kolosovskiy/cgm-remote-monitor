import type { Channel, Conversation, Contact } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

export type SendInput = { conversation: Conversation & { contact: Contact }; text: string; subject?: string };
export type SendResult = { externalId?: string };

/**
 * Адаптер канала. Каждый канал умеет:
 *  - зарегистрировать свои HTTP-маршруты (вебхуки) и/или фоновые задачи (IMAP-опрос)
 *  - отправить сообщение в диалог (если канал двусторонний)
 */
export interface ChannelAdapter {
  type: Channel;
  /** true, если настроены все необходимые переменные окружения */
  isConfigured(): boolean;
  registerRoutes?(app: FastifyInstance): Promise<void> | void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  send?(input: SendInput): Promise<SendResult>;
}
