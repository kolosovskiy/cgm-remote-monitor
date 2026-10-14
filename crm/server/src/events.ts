import { EventEmitter } from 'node:events';

/**
 * Доменные события. Автоматизации и интеграции подписываются на них,
 * а сервисы только публикуют. Это единственная точка связи между модулями.
 */
export type DomainEvents = {
  'lead.created': { leadId: string };
  'lead.stage_changed': { leadId: string; fromStageId: string | null; toStageId: string; userId?: string };
  'lead.assigned': { leadId: string; ownerId: string | null };
  'message.in': { messageId: string; conversationId: string; leadId: string | null; contactId: string; leadCreated: boolean };
  'message.out': { messageId: string; conversationId: string };
  'call.finished': { callId: string; leadId: string | null; contactId: string | null };
  'call.missed': { callId: string; leadId: string | null; contactId: string | null };
  'task.overdue': { taskId: string };
};

class TypedEmitter {
  private emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void | Promise<void>) {
    this.emitter.on(event, (payload) => {
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(`[events] handler for ${event} failed`, err);
      });
    });
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  removeAll() {
    this.emitter.removeAllListeners();
  }
}

export const events = new TypedEmitter();
