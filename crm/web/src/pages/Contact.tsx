import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Call, type Contact, type Conversation, type FieldDef, type Lead } from '../api';
import { ChannelChip, CustomFields, ErrorText, Field, IdentityLine } from '../components/ui';
import { CALL_STATUS, fmtDate, fmtDuration, IDENTITY_LABELS } from '../i18n';
import { WriteModal } from './Lead';

type Full = Contact & { leads: (Lead & { stage: { name: string; color: string } })[]; conversations: Conversation[]; calls: Call[] };

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const c = useQuery({ queryKey: ['contact', id], queryFn: () => api<Full>(`/api/contacts/${id}`) });
  const fields = useQuery({ queryKey: ['fields'], queryFn: () => api<FieldDef[]>('/api/fields') });
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [idType, setIdType] = useState('PHONE');
  const [idValue, setIdValue] = useState('');
  const [write, setWrite] = useState(false);
  useEffect(() => { if (c.data) { setName(c.data.name); setCompany(c.data.companyName ?? ''); setCustom(c.data.customFields ?? {}); } }, [c.data]);
  const inv = () => qc.invalidateQueries({ queryKey: ['contact', id] });
  const save = useMutation({ mutationFn: () => api(`/api/contacts/${id}`, { method: 'PATCH', body: { name, companyName: company || null, customFields: custom } }), onSuccess: inv });
  const addId = useMutation({ mutationFn: () => api(`/api/contacts/${id}/identities`, { body: { type: idType, value: idValue } }), onSuccess: () => { setIdValue(''); inv(); } });
  const delId = useMutation({ mutationFn: (iid: string) => api(`/api/contacts/${id}/identities/${iid}`, { method: 'DELETE' }), onSuccess: inv });
  const newLead = useMutation({ mutationFn: () => api<Lead>('/api/leads', { body: { contactId: id } }), onSuccess: (l) => nav(`/leads/${l.id}`) });
  const d = c.data;
  if (!d) return <div className="muted">Загрузка…</div>;
  return (
    <>
      <div className="page-head"><Link to="/contacts">← Контакты</Link><h1 className="grow">{d.name}</h1><button onClick={() => setWrite(true)}>Написать</button><button className="primary" onClick={() => newLead.mutate()}>+ Лид</button></div>
      <div className="lead-layout">
        <div>
          <div className="panel">
            <h3>Лиды</h3>
            {d.leads.map((l) => (
              <div className="timeline-item" key={l.id}><div className="when">{fmtDate(l.createdAt)}</div><div className="grow"><Link to={`/leads/${l.id}`}>{l.title}</Link> <span className="chip" style={{ background: l.stage.color, color: '#fff' }}>{l.stage.name}</span> <span className="muted small">{l.owner?.name}</span></div></div>
            ))}
          </div>
          <div className="panel">
            <h3>Диалоги</h3>
            {d.conversations.map((cv) => <div className="row" key={cv.id} style={{ marginBottom: 4 }}><ChannelChip channel={cv.channel} /><Link to={`/inbox/${cv.id}`}>{cv.subject ?? cv.externalId}</Link><span className="muted small">{fmtDate(cv.lastMessageAt)}</span></div>)}
          </div>
          <div className="panel">
            <h3>Звонки</h3>
            {d.calls.map((cl) => (
              <div className="timeline-item" key={cl.id}><div className="when">{fmtDate(cl.startedAt)}</div><div className="grow">{cl.direction === 'IN' ? '↙' : '↗'} {CALL_STATUS[cl.status]} · {fmtDuration(cl.durationSec)}{cl.recordingUrl && <audio controls preload="none" src={cl.recordingUrl} />}</div></div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel">
            <Field label="Имя"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Компания"><input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            <CustomFields defs={(fields.data ?? []).filter((f) => f.entity === 'CONTACT')} value={custom} onChange={setCustom} />
            <button className="primary" style={{ width: '100%' }} onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</button>
            <ErrorText error={save.error} />
          </div>
          <div className="panel">
            <h3>Идентификаторы</h3>
            {d.identities.map((i) => <div className="row" key={i.id}><div className="grow"><IdentityLine i={i} /></div><button className="small danger" onClick={() => delId.mutate(i.id)}>×</button></div>)}
            <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); addId.mutate(); }}>
              <select style={{ width: 110 }} value={idType} onChange={(e) => setIdType(e.target.value)}>{Object.entries(IDENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className="grow" value={idValue} onChange={(e) => setIdValue(e.target.value)} placeholder="значение" />
              <button disabled={!idValue}>+</button>
            </form>
            <ErrorText error={addId.error} />
          </div>
        </div>
      </div>
      {write && <WriteModal contactId={d.id} identities={d.identities.map((i) => i.type)} onClose={() => setWrite(false)} />}
    </>
  );
}
