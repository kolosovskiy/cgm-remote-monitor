import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Conversation } from '../api';
import { ChannelChip, ErrorText } from '../components/ui';
import { fmtDate } from '../i18n';

export default function InboxPage() {
  const { id } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useQuery({ queryKey: ['conversations', unreadOnly], queryFn: () => api<Conversation[]>('/api/conversations', { query: { unread: unreadOnly || undefined, limit: 100 } }), refetchInterval: 10_000 });
  return (
    <>
      <div className="page-head"><h1>Инбокс</h1><label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> только непрочитанные</label></div>
      <div className="inbox">
        <div className="panel list" style={{ padding: 0 }}>
          {list.data?.length === 0 && <div className="muted" style={{ padding: 12 }}>Диалогов нет</div>}
          {list.data?.map((c) => (
            <div key={c.id} className={`conv ${c.id === id ? 'active' : ''}`} onClick={() => nav(`/inbox/${c.id}`)}>
              <div className="name"><span>{c.contact.name}</span>{c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}</div>
              <div className="row small"><ChannelChip channel={c.channel} /><span className="muted">{fmtDate(c.lastMessageAt)}</span></div>
              <div className="preview">{c.messages[0]?.direction === 'OUT' ? '↗ ' : ''}{c.messages[0]?.text}</div>
            </div>
          ))}
        </div>
        <div className="panel thread">{id ? <Thread conversationId={id} /> : <div className="muted">Выберите диалог</div>}</div>
      </div>
    </>
  );
}

export function Thread({ conversationId, compact }: { conversationId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => api<Conversation>(`/api/conversations/${conversationId}`), refetchInterval: 8_000 });
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const send = useMutation({
    mutationFn: () => api(`/api/conversations/${conversationId}/messages`, { body: { text } }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  useEffect(() => {
    if (!compact) bottom.current?.scrollIntoView();
  }, [conv.data?.messages.length, compact]);
  const c = conv.data;
  if (!c) return <div className="muted">Загрузка…</div>;
  const canSend = c.channel !== 'WEBSITE' && c.channel !== 'PHONE' && c.channel !== 'MANUAL';
  return (
    <>
      {!compact && (
        <div className="row" style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <b>{c.contact.name}</b><ChannelChip channel={c.channel} /><span className="muted small">{c.subject ?? c.externalId}</span>
          <span className="grow" />
          {c.lead ? <Link to={`/leads/${c.lead.id}`}>Лид: {c.lead.title}</Link> : <Link to={`/contacts/${c.contact.id}`}>Контакт</Link>}
        </div>
      )}
      <div className="messages" style={compact ? { maxHeight: 400, overflow: 'auto' } : undefined}>
        {c.messages.map((m) => (
          <div key={m.id} className={`msg ${m.direction}`}>
            {m.text}
            {m.attachments?.map((a, i) => (
              <div key={i}><a href={a.url} target="_blank" rel="noreferrer">{a.name ?? a.mime ?? 'вложение'}</a></div>
            ))}
            <div className="meta">{m.direction === 'OUT' ? `${m.author?.name ?? 'авто'} · ` : ''}{fmtDate(m.createdAt)}{m.status === 'FAILED' ? ` · ошибка: ${m.error}` : m.direction === 'OUT' && m.status === 'PENDING' ? ' · отправка…' : ''}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {canSend && (
        <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
          <textarea className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответить…" style={{ minHeight: 44 }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.mutate(); }} />
          <button className="primary" disabled={send.isPending || !text.trim()}>Отправить</button>
        </form>
      )}
      <ErrorText error={send.error} />
    </>
  );
}
