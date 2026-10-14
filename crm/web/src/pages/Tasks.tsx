import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Task } from '../api';
import { fmtDate } from '../i18n';

export default function TasksPage() {
  const qc = useQueryClient();
  const [mine, setMine] = useState(true);
  const [done, setDone] = useState(false);
  const tasks = useQuery({ queryKey: ['tasks', mine, done], queryFn: () => api<Task[]>('/api/tasks', { query: { mine: mine || undefined, done: done || undefined } }) });
  const toggle = useMutation({ mutationFn: (t: Task) => api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { done: !t.doneAt } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) });
  const now = Date.now();
  return (
    <>
      <div className="page-head"><h1>Задачи</h1>
        <label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => setMine(e.target.checked)} /> только мои</label>
        <label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={done} onChange={(e) => setDone(e.target.checked)} /> выполненные</label>
      </div>
      <table>
        <thead><tr><th></th><th>Срок</th><th>Задача</th><th>Лид / контакт</th><th>Исполнитель</th></tr></thead>
        <tbody>
          {tasks.data?.map((t) => (
            <tr key={t.id}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={!!t.doneAt} onChange={() => toggle.mutate(t)} /></td>
              <td className={t.dueAt && !t.doneAt && new Date(t.dueAt).getTime() < now ? 'error' : ''}>{t.dueAt ? fmtDate(t.dueAt) : '—'}</td>
              <td>{t.title}</td>
              <td>{t.lead ? <Link to={`/leads/${t.lead.id}`}>{t.lead.title}</Link> : t.contact ? <Link to={`/contacts/${t.contact.id}`}>{t.contact.name}</Link> : ''}</td>
              <td>{t.assignee?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
