import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type FieldDef, type Lead, type User } from '../api';
import { ChannelChip, CustomFields, ErrorText, Field, IdentityLine, Modal } from '../components/ui';
import { CALL_STATUS, CHANNEL_LABELS, fmtDate, fmtDuration } from '../i18n';
import { Thread } from './Inbox';

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api<Lead>(`/api/leads/${id}`), refetchInterval: 15_000 });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const fields = useQuery({ queryKey: ['fields'], queryFn: () => api<FieldDef[]>('/api/fields') });
  const [tab, setTab] = useState<'chat' | 'calls' | 'tasks' | 'notes' | 'history'>('chat');
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [writeTo, setWriteTo] = useState(false);
  useEffect(() => {
    if (lead.data) {
      setCustom(lead.data.customFields ?? {});
      setTitle(lead.data.title);
      setAmount(lead.data.amount ? String(lead.data.amount) : '');
    }
  }, [lead.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api(`/api/leads/${id}`, { method: 'PATCH', body }), onSuccess: invalidate });
  const addNote = useMutation({ mutationFn: (text: string) => api(`/api/leads/${id}/notes`, { body: { text } }), onSuccess: invalidate });
  const addTask = useMutation({ mutationFn: (b: { title: string; dueAt?: string | null }) => api('/api/tasks', { body: { ...b, leadId: id } }), onSuccess: invalidate });
  const doneTask = useMutation({ mutationFn: (tid: string) => api(`/api/tasks/${tid}`, { method: 'PATCH', body: { done: true } }), onSuccess: invalidate });

  const l = lead.data;
  if (!l) return <div className="muted">Загрузка…</div>;
  const dirty = title !== l.title || amount !== (l.amount ? String(l.amount) : '') || JSON.stringify(custom) !== JSON.stringify(l.customFields ?? {});

  return (
    <>
      <div className="page-head">
        <Link to="/pipeline">← Воронка</Link>
        <h1 className="grow">{l.title}</h1>
        <select value={l.stageId} onChange={(e) => patch.mutate({ stageId: e.target.value })} style={{ width: 200, borderLeft: `4px solid ${l.stage.color}` }}>
          {l.pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={l.ownerId ?? ''} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })} style={{ width: 180 }}>
          <option value="">Без менеджера</option>
          {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="lead-layout">
        <div>
          <div className="tabs">
            {([['chat', `Переписка (${l.conversations?.length ?? 0})`], ['calls', `Звонки (${l.calls?.length ?? 0})`], ['tasks', `Задачи (${l.tasks?.filter((t) => !t.doneAt).length ?? 0})`], ['notes', `Заметки (${l.notes?.length ?? 0})`], ['history', 'История']] as const).map(([k, label]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          {tab === 'chat' && (
            <div className="panel">
              {l.conversations?.length === 0 && <div className="muted">Сообщений нет. Напишите клиенту через кнопку «Написать» справа.</div>}
              {l.conversations?.map((c) => (
                <div key={c.id} style={{ marginBottom: 20 }}>
                  <div className="row" style={{ marginBottom: 6 }}><ChannelChip channel={c.channel} /><span className="muted small">{c.subject ?? c.externalId}</span><Link className="small" to={`/inbox/${c.id}`}>открыть в инбоксе</Link></div>
                  <Thread conversationId={c.id} compact />
                </div>
              ))}
            </div>
          )}
          {tab === 'calls' && (
            <div className="panel">
              {l.calls?.length === 0 && <div className="muted">Звонков нет</div>}
              {l.calls?.map((c) => (
                <div className="timeline-item" key={c.id}>
                  <div className="when">{fmtDate(c.startedAt)}</div>
                  <div className="grow">
                    <div>{c.direction === 'IN' ? '↙ Входящий' : '↗ Исходящий'} · <b>{CALL_STATUS[c.status] ?? c.status}</b> · {fmtDuration(c.durationSec)}{c.user ? ` · ${c.user.name}` : c.internal ? ` · вн. ${c.internal}` : ''}</div>
                    {c.recordingUrl && <audio controls preload="none" src={c.recordingUrl} />}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'tasks' && (
            <div className="panel">
              <TaskForm onSubmit={(b) => addTask.mutate(b)} />
              {l.tasks?.map((t) => (
                <div className="timeline-item" key={t.id} style={{ opacity: t.doneAt ? 0.5 : 1 }}>
                  <div className="when">{t.dueAt ? fmtDate(t.dueAt) : '—'}</div>
                  <div className="grow">{t.title} <span className="muted small">{t.assignee?.name}</span></div>
                  {!t.doneAt && <button className="small" onClick={() => doneTask.mutate(t.id)}>Готово</button>}
                </div>
              ))}
            </div>
          )}
          {tab === 'notes' && (
            <div className="panel">
              <NoteForm onSubmit={(t) => addNote.mutate(t)} />
              {l.notes?.map((n) => (
                <div className="timeline-item" key={n.id}>
                  <div className="when">{fmtDate(n.createdAt)}<br /><span>{n.author?.name ?? 'система'}</span></div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'history' && (
            <div className="panel">
              {l.stageHistory?.map((h) => {
                const name = (sid?: string | null) => l.pipeline?.stages.find((s) => s.id === sid)?.name ?? '—';
                return (
                  <div className="timeline-item" key={h.id}><div className="when">{fmtDate(h.createdAt)}</div><div>{h.fromStage ? `${name(h.fromStage)} → ` : 'Создан: '}{name(h.toStage)}</div></div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="panel">
            <h3><Link to={`/contacts/${l.contact.id}`}>{l.contact.name}</Link></h3>
            {l.contact.companyName && <div className="muted small">{l.contact.companyName}</div>}
            {l.contact.identities.map((i) => <IdentityLine key={i.id} i={i} />)}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="small" onClick={() => setWriteTo(true)}>Написать</button>
              {l.contact.identities.find((i) => i.type === 'PHONE') && <a className="small" href={`tel:+${l.contact.identities.find((i) => i.type === 'PHONE')!.value}`}>Позвонить</a>}
            </div>
          </div>
          <div className="panel">
            <h3>Лид</h3>
            <Field label="Название"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label={`Сумма, ${l.currency}`}><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <CustomFields defs={(fields.data ?? []).filter((f) => f.entity === 'LEAD')} value={custom} onChange={setCustom} />
            <div className="small muted">Источник: {CHANNEL_LABELS[l.source] ?? l.source}{l.sourceDetail ? ` (${l.sourceDetail})` : ''}<br />Создан: {fmtDate(l.createdAt)}</div>
            {dirty && <button className="primary" style={{ marginTop: 8, width: '100%' }} disabled={patch.isPending} onClick={() => patch.mutate({ title, amount: amount ? Number(amount) : null, customFields: custom })}>Сохранить</button>}
            <ErrorText error={patch.error} />
          </div>
        </div>
      </div>
      {writeTo && <WriteModal contactId={l.contact.id} leadId={l.id} identities={l.contact.identities.map((i) => i.type)} onClose={() => { setWriteTo(false); invalidate(); }} />}
    </>
  );
}

function TaskForm({ onSubmit }: { onSubmit: (b: { title: string; dueAt?: string | null }) => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  return (
    <form className="row" style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); if (!title) return; onSubmit({ title, dueAt: due ? new Date(due).toISOString() : null }); setTitle(''); setDue(''); }}>
      <input className="grow" placeholder="Новая задача…" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="datetime-local" style={{ width: 200 }} value={due} onChange={(e) => setDue(e.target.value)} />
      <button>Добавить</button>
    </form>
  );
}

function NoteForm({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onSubmit(text); setText(''); }}>
      <textarea placeholder="Заметка…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}><button>Добавить</button></div>
    </form>
  );
}

export function WriteModal({ contactId, leadId, identities, onClose }: { contactId: string; leadId?: string; identities: string[]; onClose: () => void }) {
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<{ type: string; configured: boolean; canSend: boolean }[]>('/api/channels') });
  const available = (channels.data ?? []).filter((c) => c.canSend && c.configured && identities.includes(c.type));
  const [channel, setChannel] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const send = useMutation({ mutationFn: () => api(`/api/contacts/${contactId}/messages`, { body: { channel, text, subject: subject || undefined, leadId } }), onSuccess: onClose });
  const ch = channel || available[0]?.type || '';
  return (
    <Modal title="Написать клиенту" onClose={onClose}>
      {available.length === 0 ? (
        <div className="muted">Нет настроенных каналов, в которых у контакта есть идентификатор. Каналы включаются в настройках сервера (.env).</div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          <Field label="Канал"><select value={ch} onChange={(e) => setChannel(e.target.value)}>{available.map((c) => <option key={c.type} value={c.type}>{CHANNEL_LABELS[c.type]}</option>)}</select></Field>
          {ch === 'EMAIL' && <Field label="Тема"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label="Сообщение"><textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 120 }} /></Field>
          <ErrorText error={send.error} />
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={onClose}>Отмена</button><button className="primary" disabled={!text || send.isPending} onClick={() => setChannel(ch)}>Отправить</button></div>
        </form>
      )}
    </Modal>
  );
}
