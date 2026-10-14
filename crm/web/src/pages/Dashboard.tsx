import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Task } from '../api';
import { CHANNEL_LABELS, fmtDate } from '../i18n';

type Stats = { open: number; newMonth: number; wonMonth: number; lostMonth: number; missedCalls: number; unread: number; bySource: { source: string; count: number }[] };

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['stats-full'], queryFn: () => api<Stats>('/api/stats') });
  const tasks = useQuery({ queryKey: ['tasks', 'mine-open'], queryFn: () => api<Task[]>('/api/tasks', { query: { mine: true } }) });
  const s = stats.data;
  const stat = (v: number | undefined, l: string) => (
    <div className="stat">
      <div className="v">{v ?? '…'}</div>
      <div className="l">{l}</div>
    </div>
  );
  return (
    <>
      <div className="page-head"><h1>Сводка</h1><span className="muted small">за последние 30 дней</span></div>
      <div className="stats">
        {stat(s?.open, 'Открытых лидов')}
        {stat(s?.newMonth, 'Новых лидов')}
        {stat(s?.wonMonth, 'Успешных')}
        {stat(s?.lostMonth, 'Отказов')}
        {stat(s?.missedCalls, 'Пропущенных звонков')}
        {stat(s?.unread, 'Непрочитанных диалогов')}
      </div>
      <div className="lead-layout">
        <div className="panel">
          <h3>Мои задачи</h3>
          {tasks.data?.length === 0 && <div className="muted">Нет открытых задач</div>}
          {tasks.data?.map((t) => (
            <div className="timeline-item" key={t.id}>
              <div className="when">{t.dueAt ? fmtDate(t.dueAt) : 'без срока'}</div>
              <div>
                {t.title}
                {t.lead && (
                  <div className="small"><Link to={`/leads/${t.lead.id}`}>{t.lead.title}</Link></div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Лиды по источникам</h3>
          {s?.bySource.map((b) => (
            <div className="row" key={b.source}><span className="grow">{CHANNEL_LABELS[b.source] ?? b.source}</span><b>{b.count}</b></div>
          ))}
        </div>
      </div>
    </>
  );
}
