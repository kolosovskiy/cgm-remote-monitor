import { prisma } from '../db.js';

/** Сохраняет сырой вебхук и выполняет обработчик; ошибка пишется в лог, а не роняет сервер. */
export async function withWebhookLog<T>(channel: string, payload: unknown, handler: () => Promise<T>): Promise<T | undefined> {
  const log = await prisma.webhookLog.create({ data: { channel, payload: payload as object } });
  try {
    const result = await handler();
    await prisma.webhookLog.update({ where: { id: log.id }, data: { processedAt: new Date() } });
    return result;
  } catch (err) {
    const e = err as Error;
    console.error(`[webhook:${channel}]`, e);
    await prisma.webhookLog.update({ where: { id: log.id }, data: { error: e.stack ?? e.message } });
    return undefined;
  }
}
