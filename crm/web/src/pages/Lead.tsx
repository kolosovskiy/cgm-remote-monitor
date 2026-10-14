import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type FieldDef, type Lead, type User } from '../api';
import { ChannelChip, CustomFields, ErrorText, Field, IdentityLine, Modal } from '../components/ui';
import { fmtDuration, label, useFormat, useT } from '../i18n';
import { useCan, useMe } from '../App';
import { Thread } from './Inbox';

export default function LeadPage() {
  const { t } = useT();
  const { fmtDate } = useFormat();
  const can = useCan();
  const me = useMe();
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

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['leads'] }); };
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api(`/api/leads/${id}`, { method: 'PATCH', body }), onSuccess: invalidate });
  const addNote = useMutation({ mutationFn: (text: string) => api(`/api/leads/${id}/notes`, { body: { text } }), onSuccess: invalidate });
  const addTask = useMutation({ mutationFn: (b: { title: string; dueAt?: string | null }) => api('/api/tasks', { body: { ...b, leadId: id } }), onSuccess: invalidate });
  const doneTask = useMutation({ mutationFn: (tid: string) => api(`/api/tasks/${tid}`, { method: 'PATCH', body: { done: true } }), onSuccess: invalidate });

  const l = lead.data;
  if (!l) return <div className="muted">{t('common.loading')}</div>;
  const editable = can('leads.edit_any') || !l.ownerId || l.ownerId === me.data?.id;
  const canReassign = can('leads.reassign') || (!l.ownerId);
  const dirty = title !== l.title || amount !== (l.amount ? String(l.amount) : '') || JSON.stringify(custom) !== JSON.stringify(l.customFields ?? {});
  const stageName = (sid?: string | null) => l.pipeline?.stages.find((s) => s.id === sid)?.name ?? '—';

  return (
    <>
      <div className="page-head">
        <Link to="/pipeline">{t('lead.backToPipeline')}</Link>
        <h1 className="grow">{l.title}</h1>
        <select value={l.stageId} disabled={!editable} onChange={(e) => patch.mutate({ stageId: e.target.value })} style={{ width: 200, borderLeft: `4px solid ${l.stage.color}` }}>
          {l.pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={l.ownerId ?? ''} disabled={!canReassign} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })} style={{ width: 180 }}>
          <option value="">{t('lead.noOwner')}</option>
          {(can('leads.reassign') ? users.data ?? [] : users.data?.filter((u) => u.id === me.data?.id) ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <ErrorText error={patch.error} />
      <div className="lead-layout">
        <div>
          <div className="tabs">
            {([['chat', `${t('lead.tabChat')} (${l.conversations?.length ?? 0})`], ['calls', `${t('lead.tabCalls')} (${l.calls?.length ?? 0})`], ['tasks', `${t('lead.tabTasks')} (${l.tasks?.filter((x) => !x.doneAt).length ?? 0})`], ['notes', `${t('lead.tabNotes')} (${l.notes?.length ?? 0})`], ['history', t('lead.tabHistory')]] as const).map(([k, lbl]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{lbl}</button>
            ))}
          </div>
          {tab === 'chat' && (
            <div className="panel">
              {l.conversations?.length === 0 && <div className="muted">{t('lead.noMessages')}</div>}
              {l.conversations?.map((c) => (
                <div key={c.id} style={{ marginBottom: 20 }}>
                  <div className="row" style={{ marginBottom: 6 }}><ChannelChip channel={c.channel} /><span className="muted small">{c.subject ?? c.externalId}</span><Link className="small" to={`/inbox/${c.id}`}>{t('lead.openInInbox')}</Link></div>
                  <Thread conversationId={c.id} compact />
                </div>
              ))}
            </div>
          )}
          {tab === 'calls' && (
            <div className="panel">
              {l.calls?.length === 0 && <div className="muted">{t('lead.noCalls')}</div>}
              {l.calls?.map((c) => (
                <div className="timeline-item" key={c.id}>
                  <div className="when">{fmtDate(c.startedAt)}</div>
                  <div className="grow">
                    <div>{c.direction === 'IN' ? t('lead.incoming') : t('lead.outgoing')} · <b>{label(t, 'callStatus', c.status)}</b> · {fmtDuration(c.durationSec)}{c.user ? ` · ${c.user.name}` : c.internal ? ` · ${t('lead.ext')} ${c.internal}` : ''}</div>
                    {c.recordingUrl && <audio controls preload="none" src={c.recordingUrl} />}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'tasks' && (
            <div className="panel">
              <TaskForm onSubmit={(b) => addTask.mutate(b)} />
              {l.tasks?.map((x) => (
                <div className="timeline-item" key={x.id} style={{ opacity: x.doneAt ? 0.5 : 1 }}>
                  <div className="when">{x.dueAt ? fmtDate(x.dueAt) : '—'}</div>
                  <div className="grow">{x.title} <span className="muted small">{x.assignee?.name}</span></div>
                  {!x.doneAt && <button className="small" onClick={() => doneTask.mutate(x.id)}>{t('common.done')}</button>}
                </div>
              ))}
            </div>
          )}
          {tab === 'notes' && (
            <div className="panel">
              <NoteForm onSubmit={(x) => addNote.mutate(x)} />
              {l.notes?.map((n) => (
                <div className="timeline-item" key={n.id}>
                  <div className="when">{fmtDate(n.createdAt)}<br /><span>{n.author?.name ?? t('lead.system')}</span></div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'history' && (
            <div className="panel">
              {l.stageHistory?.map((h) => (
                <div className="timeline-item" key={h.id}><div className="when">{fmtDate(h.createdAt)}</div><div>{h.fromStage ? `${stageName(h.fromStage)} → ` : t('lead.historyCreated')}{stageName(h.toStage)}</div></div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="panel">
            <h3><Link to={`/contacts/${l.contact.id}`}>{l.contact.name}</Link></h3>
            {l.contact.companyName && <div className="muted small">{l.contact.companyName}</div>}
            {l.contact.identities.map((i) => <IdentityLine key={i.id} i={i} />)}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="small" onClick={() => setWriteTo(true)}>{t('lead.write')}</button>
              {l.contact.identities.find((i) => i.type === 'PHONE') && <a className="small" href={`tel:+${l.contact.identities.find((i) => i.type === 'PHONE')!.value}`}>{t('lead.call')}</a>}
            </div>
          </div>
          <div className="panel">
            <h3>{t('lead.card')}</h3>
            <Field label={t('lead.title')}><input value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label={t('lead.amountCur', { cur: l.currency })}><input type="number" value={amount} disabled={!editable} onChange={(e) => setAmount(e.target.value)} /></Field>
            <CustomFields defs={(fields.data ?? []).filter((f) => f.entity === 'LEAD')} value={custom} onChange={setCustom} />
            <div className="small muted">{t('lead.source')}: {label(t, 'channel', l.source)}{l.sourceDetail ? ` (${l.sourceDetail})` : ''}<br />{t('lead.createdAt')}: {fmtDate(l.createdAt)}</div>
            {dirty && editable && <button className="primary" style={{ marginTop: 8, width: '100%' }} disabled={patch.isPending} onClick={() => patch.mutate({ title, amount: amount ? Number(amount) : null, customFields: custom })}>{t('common.save')}</button>}
          </div>
        </div>
      </div>
      {writeTo && <WriteModal contactId={l.contact.id} leadId={l.id} identities={l.contact.identities.map((i) => i.type)} onClose={() => { setWriteTo(false); invalidate(); }} />}
    </>
  );
}

function TaskForm({ onSubmit }: { onSubmit: (b: { title: string; dueAt?: string | null }) => void }) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  return (
    <form className="row" style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); if (!title) return; onSubmit({ title, dueAt: due ? new Date(due).toISOString() : null }); setTitle(''); setDue(''); }}>
      <input className="grow" placeholder={t('lead.newTaskPh')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="datetime-local" style={{ width: 200 }} value={due} onChange={(e) => setDue(e.target.value)} />
      <button>{t('common.add')}</button>
    </form>
  );
}

function NoteForm({ onSubmit }: { onSubmit: (t: string) => void }) {
  const { t } = useT();
  const [text, setText] = useState('');
  return (
    <form style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onSubmit(text); setText(''); }}>
      <textarea placeholder={t('lead.notePh')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}><button>{t('common.add')}</button></div>
    </form>
  );
}

export function WriteModal({ contactId, leadId, identities, onClose }: { contactId: string; leadId?: string; identities: string[]; onClose: () => void }) {
  const { t } = useT();
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<{ type: string; configured: boolean; canSend: boolean }[]>('/api/channels') });
  const available = (channels.data ?? []).filter((c) => c.canSend && c.configured && identities.includes(c.type));
  const [channel, setChannel] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const ch = channel || available[0]?.type || '';
  const send = useMutation({ mutationFn: () => api(`/api/contacts/${contactId}/messages`, { body: { channel: ch, text, subject: subject || undefined, leadId } }), onSuccess: onClose });
  return (
    <Modal title={t('lead.writeTitle')} onClose={onClose}>
      {available.length === 0 ? (
        <div className="muted">{t('lead.noChannels')}</div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          <Field label={t('lead.channel')}><select value={ch} onChange={(e) => setChannel(e.target.value)}>{available.map((c) => <option key={c.type} value={c.type}>{label(t, 'channel', c.type)}</option>)}</select></Field>
          {ch === 'EMAIL' && <Field label={t('lead.subject')}><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label={t('lead.message')}><textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 120 }} /></Field>
          <ErrorText error={send.error} />
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={onClose}>{t('common.cancel')}</button><button className="primary" disabled={!text || send.isPending}>{t('common.send')}</button></div>
        </form>
      )}
    </Modal>
  );
}
