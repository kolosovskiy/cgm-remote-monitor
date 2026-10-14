import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Task } from '../api';
import { useFormat, useT } from '../i18n';

export default function TasksPage() {
  const { t } = useT();
  const { fmtDate } = useFormat();
  const qc = useQueryClient();
  const [mine, setMine] = useState(true);
  const [done, setDone] = useState(false);
  const tasks = useQuery({ queryKey: ['tasks', mine, done], queryFn: () => api<Task[]>('/api/tasks', { query: { mine: mine || undefined, done: done || undefined } }) });
  const toggle = useMutation({ mutationFn: (x: Task) => api(`/api/tasks/${x.id}`, { method: 'PATCH', body: { done: !x.doneAt } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) });
  const now = Date.now();
  return (
    <>
      <div className="page-head"><h1>{t('tasks.title')}</h1>
        <label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('tasks.mine')}</label>
        <label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={done} onChange={(e) => setDone(e.target.checked)} /> {t('tasks.done')}</label>
      </div>
      <table>
        <thead><tr><th></th><th>{t('tasks.due')}</th><th>{t('tasks.task')}</th><th>{t('tasks.link')}</th><th>{t('tasks.assignee')}</th></tr></thead>
        <tbody>
          {tasks.data?.map((x) => (
            <tr key={x.id}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={!!x.doneAt} onChange={() => toggle.mutate(x)} /></td>
              <td className={x.dueAt && !x.doneAt && new Date(x.dueAt).getTime() < now ? 'error' : ''}>{x.dueAt ? fmtDate(x.dueAt) : '—'}</td>
              <td>{x.title}</td>
              <td>{x.lead ? <Link to={`/leads/${x.lead.id}`}>{x.lead.title}</Link> : x.contact ? <Link to={`/contacts/${x.contact.id}`}>{x.contact.name}</Link> : ''}</td>
              <td>{x.assignee?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
