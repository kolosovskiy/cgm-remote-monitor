import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Task } from '../api';
import { label, useFormat, useT } from '../i18n';

type Stats = { open: number; newMonth: number; wonMonth: number; lostMonth: number; missedCalls: number; unread: number; bySource: { source: string; count: number }[] };

export default function Dashboard() {
  const { t } = useT();
  const { fmtDate } = useFormat();
  const stats = useQuery({ queryKey: ['stats-full'], queryFn: () => api<Stats>('/api/stats') });
  const tasks = useQuery({ queryKey: ['tasks', 'mine-open'], queryFn: () => api<Task[]>('/api/tasks', { query: { mine: true } }) });
  const s = stats.data;
  const stat = (v: number | undefined, l: string) => (
    <div className="stat"><div className="v">{v ?? '…'}</div><div className="l">{l}</div></div>
  );
  return (
    <>
      <div className="page-head"><h1>{t('dash.title')}</h1><span className="muted small">{t('dash.period')}</span></div>
      <div className="stats">
        {stat(s?.open, t('dash.open'))}
        {stat(s?.newMonth, t('dash.new'))}
        {stat(s?.wonMonth, t('dash.won'))}
        {stat(s?.lostMonth, t('dash.lost'))}
        {stat(s?.missedCalls, t('dash.missed'))}
        {stat(s?.unread, t('dash.unread'))}
      </div>
      <div className="lead-layout">
        <div className="panel">
          <h3>{t('dash.myTasks')}</h3>
          {tasks.data?.length === 0 && <div className="muted">{t('dash.noTasks')}</div>}
          {tasks.data?.map((task) => (
            <div className="timeline-item" key={task.id}>
              <div className="when">{task.dueAt ? fmtDate(task.dueAt) : t('dash.noDue')}</div>
              <div>{task.title}{task.lead && <div className="small"><Link to={`/leads/${task.lead.id}`}>{task.lead.title}</Link></div>}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>{t('dash.bySource')}</h3>
          {s?.bySource.map((b) => <div className="row" key={b.source}><span className="grow">{label(t, 'channel', b.source)}</span><b>{b.count}</b></div>)}
        </div>
      </div>
    </>
  );
}
