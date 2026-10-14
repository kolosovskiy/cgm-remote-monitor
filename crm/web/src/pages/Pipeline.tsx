import { useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Contact, type FieldDef, type Lead, type Pipeline, type Stage, type User } from '../api';
import { CustomFields, ErrorText, Field, Modal, useDebounce } from '../components/ui';
import { label, useFormat, useT } from '../i18n';
import { useCan } from '../App';

export default function PipelinePage() {
  const { t } = useT();
  const { fmtDate, fmtNumber } = useFormat();
  const qc = useQueryClient();
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Pipeline[]>('/api/pipelines') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const [pipelineId, setPipelineId] = useState<string>();
  const [ownerId, setOwnerId] = useState('');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [creating, setCreating] = useState(false);
  const dSearch = useDebounce(search);
  const pipeline = pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];

  const leads = useQuery({
    queryKey: ['leads', pipeline?.id, ownerId, dSearch, showClosed],
    queryFn: () => api<{ items: Lead[] }>('/api/leads', { query: { pipelineId: pipeline!.id, ownerId, search: dSearch, status: showClosed ? undefined : 'OPEN', limit: 500 } }),
    enabled: !!pipeline,
    refetchInterval: 20_000,
  });

  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api(`/api/leads/${id}`, { method: 'PATCH', body: { stageId } }),
    onMutate: async ({ id, stageId }) => {
      const key = ['leads', pipeline?.id, ownerId, dSearch, showClosed];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ items: Lead[] }>(key);
      if (prev) qc.setQueryData(key, { items: prev.items.map((l) => (l.id === id ? { ...l, stageId } : l)) });
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const byStage = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    for (const l of leads.data?.items ?? []) (m[l.stageId] ??= []).push(l);
    return m;
  }, [leads.data]);

  const [over, setOver] = useState<string | null>(null);
  const onDrop = (e: DragEvent, stage: Stage) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/lead');
    if (id) move.mutate({ id, stageId: stage.id });
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('pipe.title')}</h1>
        <select style={{ width: 200 }} value={pipeline?.id ?? ''} onChange={(e) => setPipelineId(e.target.value)}>
          {pipelines.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={{ width: 180 }} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">{t('pipe.allManagers')}</option>
          {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input style={{ width: 220 }} placeholder={t('pipe.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="row small"><input type="checkbox" style={{ width: 'auto' }} checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> {t('pipe.closed')}</label>
        <span className="grow" />
        <button className="primary" onClick={() => setCreating(true)}>{t('pipe.newLead')}</button>
        <ErrorText error={move.error} />
      </div>
      <div className="kanban">
        {pipeline?.stages.map((s) => {
          const items = byStage[s.id] ?? [];
          const sum = items.reduce((a, l) => a + Number(l.amount ?? 0), 0);
          return (
            <div key={s.id} className={`column ${over === s.id ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, s)}>
              <div className="column-head" style={{ borderTopColor: s.color }}>
                <span>{s.name}</span>
                <span className="muted small">{items.length}{sum ? ` · ${fmtNumber(sum)}` : ''}</span>
              </div>
              {items.map((l) => (
                <Link key={l.id} to={`/leads/${l.id}`} className="card" draggable onDragStart={(e) => e.dataTransfer.setData('text/lead', l.id)}>
                  <div className="title">{l.title}</div>
                  <div className="small">{l.contact.name}{l.contact.companyName ? ` · ${l.contact.companyName}` : ''}</div>
                  <div className="meta">
                    <span>{label(t, 'channel', l.source)}{l.owner ? ` · ${l.owner.name}` : ''}</span>
                    <span>{fmtDate(l.createdAt).slice(0, 8)}</span>
                  </div>
                  {l.amount ? <div className="small"><b>{fmtNumber(Number(l.amount))} {l.currency}</b></div> : null}
                  {!!l._count?.tasks && <span className="chip">{t('pipe.tasks')}: {l._count.tasks}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      {creating && pipeline && <CreateLeadModal pipeline={pipeline} users={users.data ?? []} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateLeadModal({ pipeline, users, onClose }: { pipeline: Pipeline; users: User[]; onClose: () => void }) {
  const { t } = useT();
  const can = useCan();
  const qc = useQueryClient();
  const fields = useQuery({ queryKey: ['fields'], queryFn: () => api<FieldDef[]>('/api/fields') });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [stageId, setStageId] = useState(pipeline.stages[0]?.id);
  const [ownerId, setOwnerId] = useState('');
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [existing, setExisting] = useState<Contact | null>(null);
  const dPhone = useDebounce(phone);
  useQuery({
    queryKey: ['contact-lookup', dPhone],
    queryFn: async () => {
      const r = await api<{ items: Contact[] }>('/api/contacts', { query: { search: dPhone, limit: 1 } });
      setExisting(r.items[0] ?? null);
      return r;
    },
    enabled: dPhone.replace(/\D/g, '').length >= 9,
  });

  const create = useMutation({
    mutationFn: async () => {
      const identities = [phone && { type: 'PHONE', value: phone }, email && { type: 'EMAIL', value: email }].filter(Boolean);
      const contact = existing ?? (await api<Contact>('/api/contacts', { body: { name: name || t('common.noName'), identities } }));
      return api<Lead>('/api/leads', { body: { contactId: contact.id, title: title || undefined, pipelineId: pipeline.id, stageId, ownerId: ownerId || null, amount: amount ? Number(amount) : null, customFields: custom } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); onClose(); },
  });

  return (
    <Modal title={t('pipe.newLeadTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label={t('common.phone')}><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('pipe.phonePh')} /></Field>
        {existing && <div className="small" style={{ marginTop: -6, marginBottom: 8 }}>{t('pipe.foundContact', { name: existing.name })}</div>}
        {!existing && (
          <>
            <Field label={t('pipe.clientName')}><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t('common.email')}><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </>
        )}
        <Field label={t('pipe.leadTitle')}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('pipe.leadTitlePh')} /></Field>
        <div className="row">
          <Field label={t('pipe.amount')}><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('pipe.stage')}><select value={stageId} onChange={(e) => setStageId(e.target.value)}>{pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
        {can('leads.reassign') && (
          <Field label={t('pipe.manager')}><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">{t('pipe.me')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        )}
        <CustomFields defs={(fields.data ?? []).filter((f) => f.entity === 'LEAD')} value={custom} onChange={setCustom} />
        <ErrorText error={create.error} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={create.isPending || (!phone && !email && !existing)}>{t('common.create')}</button>
        </div>
      </form>
    </Modal>
  );
}
