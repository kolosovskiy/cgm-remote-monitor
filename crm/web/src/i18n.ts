/** Подписи интерфейса. Для украинской версии достаточно добавить второй словарь и переключатель. */
export const CHANNEL_LABELS: Record<string, string> = {
  WEBSITE: 'Сайт',
  EMAIL: 'Email',
  PHONE: 'Телефон',
  TELEGRAM: 'Telegram',
  VIBER: 'Viber',
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
  MANUAL: 'Вручную',
};
export const IDENTITY_LABELS: Record<string, string> = {
  PHONE: 'Телефон',
  EMAIL: 'Email',
  TELEGRAM: 'Telegram',
  VIBER: 'Viber',
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
};
export const CALL_STATUS: Record<string, string> = { ANSWERED: 'Отвечен', MISSED: 'Пропущен', BUSY: 'Занято', FAILED: 'Не дозвонились' };
export const TRIGGER_LABELS: Record<string, string> = {
  'lead.created': 'Создан лид',
  'lead.stage_changed': 'Лид сменил этап',
  'lead.assigned': 'Лид назначен менеджеру',
  'message.in': 'Входящее сообщение',
  'call.finished': 'Звонок завершён',
  'call.missed': 'Пропущенный звонок',
  'task.overdue': 'Задача просрочена',
};
export const ACTION_LABELS: Record<string, string> = {
  assign_round_robin: 'Назначить менеджера по кругу',
  assign_user: 'Назначить менеджера',
  move_stage: 'Перенести на этап',
  reply_same_channel: 'Ответить в том же канале',
  send_message: 'Отправить сообщение в канал',
  create_task: 'Создать задачу',
  add_note: 'Добавить заметку',
  webhook: 'Вызвать вебхук',
};
export const OP_LABELS: Record<string, string> = { eq: 'равно', neq: 'не равно', contains: 'содержит', in: 'одно из', empty: 'пусто', not_empty: 'не пусто', gt: 'больше', lt: 'меньше' };

export function fmtDate(s?: string | null) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function fmtPhone(v: string) {
  if (/^380\d{9}$/.test(v)) return `+380 ${v.slice(3, 5)} ${v.slice(5, 8)} ${v.slice(8, 10)} ${v.slice(10)}`;
  return /^\d+$/.test(v) ? '+' + v : v;
}
export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
