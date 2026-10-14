import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, type Automation, type FieldDef, type Pipeline, type User } from '../api';
import { ErrorText, Field, Modal } from '../components/ui';
import { LOCALES, label, useFormat, useT, type TFn } from '../i18n';
import { useCan } from '../App';

const ROLES = ['ADMIN', 'DEVELOPER', 'MANAGER', 'OPERATOR'];
const ACTIONS = ['assign_round_robin', 'assign_user', 'move_stage', 'reply_same_channel', 'send_message', 'create_task', 'add_note', 'webhook'];
const OPS = ['eq', 'neq', 'contains', 'in', 'empty', 'not_empty', 'gt', 'lt'];
const SEND_CHANNELS = ['EMAIL', 'TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'];

export default function SettingsPage() {
  const { t } = useT();
  const can = useCan();
  const tabs: [string, string, boolean][] = [
    ['pipelines', t('set.pipelines'), can('settings.manage')],
    ['fields', t('set.fields'), can('settings.manage')],
    ['automations', t('set.automations'), can('settings.manage')],
    ['users', t('set.users'), can('users.manage')],
    ['channels', t('set.channels'), can('integrations.manage')],
    ['logs', t('set.logs'), can('integrations.manage')],
  ];
  const first = tabs.find((x) => x[2])?.[0] ?? 'pipelines';
  return (
    <>
      <div className="page-head"><h1>{t('set.title')}</h1></div>
      <div className="tabs">{tabs.filter((x) => x[2]).map(([k, l]) => <NavLink key={k} to={`/settings/${k}`}>{({ isActive }) => <button className={isActive ? 'active' : ''}>{l}</button>}</NavLink>)}</div>
      <Routes>
        <Route path="pipelines" element={<Pipelines />} />
        <Route path="fields" element={<Fields />} />
        <Route path="automations" element={<Automations />} />
        <Route path="users" element={<Users />} />
        <Route path="channels" element={<Channels />} />
        <Route path="logs" element={<Logs />} />
        <Route path="*" element={<Navigate to={`/settings/${first}`} />} />
      </Routes>
    </>
  );
}

function Pipelines() {
  const { t } = useT();
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['pipelines'] });
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Pipeline[]>('/api/pipelines') });
  const [newName, setNewName] = useState('');
  const createP = useMutation({ mutationFn: () => api('/api/pipelines', { body: { name: newName } }), onSuccess: () => { setNewName(''); inv(); } });
  const patchP = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/api/pipelines/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: inv });
  const delP = useMutation({ mutationFn: (id: string) => api(`/api/pipelines/${id}`, { method: 'DELETE' }), onSuccess: inv });
  const addS = useMutation({ mutationFn: (v: { id: string; name: string }) => api(`/api/pipelines/${v.id}/stages`, { body: { name: v.name } }), onSuccess: inv });
  const patchS = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/api/stages/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: inv });
  const delS = useMutation({ mutationFn: (id: string) => api(`/api/stages/${id}`, { method: 'DELETE' }), onSuccess: inv });
  const order = useMutation({ mutationFn: (v: { id: string; stageIds: string[] }) => api(`/api/pipelines/${v.id}/stages/order`, { method: 'PUT', body: { stageIds: v.stageIds } }), onSuccess: inv });
  const err = createP.error ?? delP.error ?? delS.error ?? patchS.error;
  const swap = (p: Pipeline, i: number, j: number) => { const ids = p.stages.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]]; order.mutate({ id: p.id, stageIds: ids }); };
  return (
    <>
      {pipelines.data?.map((p) => (
        <div className="panel" key={p.id}>
          <div className="row"><input style={{ width: 260, fontWeight: 600 }} defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && patchP.mutate({ id: p.id, body: { name: e.target.value } })} />
            {p.isDefault ? <span className="chip">{t('set.pipe.default')}</span> : <button className="small" onClick={() => patchP.mutate({ id: p.id, body: { isDefault: true } })}>{t('set.pipe.makeDefault')}</button>}
            <span className="grow" /><button className="small danger" onClick={() => confirm(t('set.pipe.confirmDelete')) && delP.mutate(p.id)}>{t('common.delete')}</button></div>
          <table style={{ marginTop: 10 }}>
            <tbody>
              {p.stages.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ width: 60 }}><button className="small" disabled={i === 0} onClick={() => swap(p, i, i - 1)}>↑</button> <button className="small" disabled={i === p.stages.length - 1} onClick={() => swap(p, i, i + 1)}>↓</button></td>
                  <td><input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && patchS.mutate({ id: s.id, body: { name: e.target.value } })} /></td>
                  <td style={{ width: 60 }}><input type="color" defaultValue={s.color} onBlur={(e) => patchS.mutate({ id: s.id, body: { color: e.target.value } })} /></td>
                  <td style={{ width: 220 }}>
                    <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={s.isWon} onChange={(e) => patchS.mutate({ id: s.id, body: { isWon: e.target.checked, isLost: false } })} /> {t('set.pipe.won')}</label>{' '}
                    <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={s.isLost} onChange={(e) => patchS.mutate({ id: s.id, body: { isLost: e.target.checked, isWon: false } })} /> {t('set.pipe.lost')}</label>
                  </td>
                  <td style={{ width: 40 }}><button className="small danger" onClick={() => delS.mutate(s.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('n') as HTMLInputElement; if (f.value) { addS.mutate({ id: p.id, name: f.value }); f.value = ''; } }}>
            <input name="n" placeholder={t('set.pipe.newStagePh')} style={{ width: 260 }} /><button>{t('set.pipe.addStage')}</button>
          </form>
        </div>
      ))}
      <div className="panel"><form className="row" onSubmit={(e) => { e.preventDefault(); createP.mutate(); }}><input style={{ width: 260 }} placeholder={t('set.pipe.newPipelinePh')} value={newName} onChange={(e) => setNewName(e.target.value)} /><button className="primary" disabled={!newName}>{t('set.pipe.create')}</button></form></div>
      <ErrorText error={err} />
    </>
  );
}

function Fields() {
  const { t } = useT();
  const qc = useQueryClient();
  const fields = useQuery({ queryKey: ['fields'], queryFn: () => api<FieldDef[]>('/api/fields') });
  const [f, setF] = useState({ entity: 'LEAD', key: '', label: '', type: 'TEXT', options: '', required: false });
  const create = useMutation({ mutationFn: () => api('/api/fields', { body: { ...f, options: f.options.split(',').map((s) => s.trim()).filter(Boolean) } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields'] }); setF({ ...f, key: '', label: '', options: '' }); } });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/fields/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['fields'] }) });
  return (
    <>
      <table>
        <thead><tr><th>{t('set.fields.entity')}</th><th>{t('set.fields.key')}</th><th>{t('set.fields.label')}</th><th>{t('set.fields.type')}</th><th>{t('set.fields.options')}</th><th></th></tr></thead>
        <tbody>{fields.data?.map((d) => <tr key={d.id}><td>{d.entity === 'LEAD' ? t('set.fields.lead') : t('set.fields.contact')}</td><td><code>{d.key}</code></td><td>{d.label}{d.required && ' *'}</td><td>{d.type}</td><td>{d.options.join(', ')}</td><td><button className="small danger" onClick={() => del.mutate(d.id)}>×</button></td></tr>)}</tbody>
      </table>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>{t('set.fields.new')}</h3>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <select style={{ width: 120 }} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="LEAD">{t('set.fields.lead')}</option><option value="CONTACT">{t('set.fields.contact')}</option></select>
          <input style={{ width: 160 }} placeholder={t('set.fields.keyPh')} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
          <input style={{ width: 200 }} placeholder={t('set.fields.labelPh')} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <select style={{ width: 120 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOL'].map((x) => <option key={x}>{x}</option>)}</select>
          {f.type === 'SELECT' && <input style={{ width: 260 }} placeholder={t('set.fields.optionsPh')} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />}
          <label className="small row"><input type="checkbox" style={{ width: 'auto' }} checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> {t('set.fields.required')}</label>
          <button className="primary" disabled={!f.key || !f.label}>{t('common.add')}</button>
        </form>
        <ErrorText error={create.error} />
      </div>
    </>
  );
}

function Automations() {
  const { t } = useT();
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ['automations'], queryFn: () => api<{ triggers: string[]; items: Automation[] }>('/api/automations') });
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Pipeline[]>('/api/pipelines') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const inv = () => qc.invalidateQueries({ queryKey: ['automations'] });
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const save = useMutation({ mutationFn: (a: Partial<Automation>) => (a.id ? api(`/api/automations/${a.id}`, { method: 'PATCH', body: a }) : api('/api/automations', { body: a })), onSuccess: () => { inv(); setEditing(null); } });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/automations/${id}`, { method: 'DELETE' }), onSuccess: inv });
  const toggle = useMutation({ mutationFn: (a: Automation) => api(`/api/automations/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }), onSuccess: inv });
  const describeAction = (a: Record<string, unknown>) => {
    const ty = String(a.type);
    const extra = ty === 'move_stage' ? pipelines.data?.flatMap((p) => p.stages).find((s) => s.id === a.stageId)?.name : ty === 'assign_user' ? users.data?.find((u) => u.id === a.userId)?.name : ty === 'create_task' ? `«${a.title}»` : ty === 'send_message' ? `${label(t, 'channel', String(a.channel))}: «${String(a.text).slice(0, 40)}»` : ty === 'reply_same_channel' || ty === 'add_note' ? `«${String(a.text).slice(0, 40)}»` : ty === 'webhook' ? String(a.url) : '';
    return `${label(t, 'action', ty)}${extra ? ` → ${extra}` : ''}`;
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}><span className="muted small">{t('set.auto.hint')}</span><span className="grow" /><button className="primary" onClick={() => setEditing({ name: '', trigger: 'lead.created', conditions: [], actions: [], enabled: true })}>{t('set.auto.new')}</button></div>
      <table>
        <thead><tr><th></th><th>{t('set.auto.name')}</th><th>{t('set.auto.trigger')}</th><th>{t('set.auto.conditions')}</th><th>{t('set.auto.actions')}</th><th></th></tr></thead>
        <tbody>
          {data.data?.items.map((a) => (
            <tr key={a.id} style={{ opacity: a.enabled ? 1 : 0.5 }}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={a.enabled} onChange={() => toggle.mutate(a)} /></td>
              <td>{a.name}</td><td>{label(t, 'trigger', a.trigger)}</td>
              <td className="small">{a.conditions.length === 0 ? <span className="muted">{t('set.auto.always')}</span> : a.conditions.map((c, i) => <div key={i}><code>{c.field}</code> {label(t, 'op', c.op)} {c.value !== undefined && <code>{JSON.stringify(c.value)}</code>}</div>)}</td>
              <td className="small">{a.actions.map((x, i) => <div key={i}>{describeAction(x)}</div>)}</td>
              <td><button className="small" onClick={() => setEditing(a)}>{t('common.edit')}</button> <button className="small danger" onClick={() => del.mutate(a.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <AutomationEditor t={t} value={editing} triggers={data.data?.triggers ?? []} pipelines={pipelines.data ?? []} users={users.data ?? []} onSave={(a) => save.mutate(a)} onClose={() => setEditing(null)} error={save.error} />}
    </>
  );
}

function AutomationEditor({ t, value, triggers, pipelines, users, onSave, onClose, error }: { t: TFn; value: Partial<Automation>; triggers: string[]; pipelines: Pipeline[]; users: User[]; onSave: (a: Partial<Automation>) => void; onClose: () => void; error: unknown }) {
  const [a, setA] = useState<Partial<Automation>>({ ...value, conditions: value.conditions ?? [], actions: value.actions ?? [] });
  const conds = a.conditions ?? [];
  const acts = a.actions ?? [];
  const setCond = (i: number, patch: Record<string, unknown>) => setA({ ...a, conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAct = (i: number, patch: Record<string, unknown>) => setA({ ...a, actions: acts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const stages = pipelines.flatMap((p) => p.stages.map((s) => ({ ...s, label: `${p.name} / ${s.name}` })));
  const fieldHints = ['lead.source', 'lead.stageId', 'lead.ownerId', 'lead.amount', 'lead.customFields.service', 'contact.name', 'contact.customFields.city', 'message.channel', 'message.text', 'call.status', 'call.direction', 'leadCreated'];
  return (
    <Modal title={a.id ? t('set.auto.rule') : t('set.auto.newRule')} onClose={onClose}>
      <Field label={t('set.auto.name')}><input value={a.name ?? ''} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
      <Field label={t('set.auto.trigger')}><select value={a.trigger} onChange={(e) => setA({ ...a, trigger: e.target.value })}>{triggers.map((x) => <option key={x} value={x}>{label(t, 'trigger', x)}</option>)}</select></Field>
      <h3>{t('set.auto.conditions')}</h3>
      {conds.map((c, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input list="field-hints" style={{ width: 180 }} value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} placeholder={t('set.auto.field')} />
          <select style={{ width: 130 }} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{OPS.map((k) => <option key={k} value={k}>{label(t, 'op', k)}</option>)}</select>
          {!['empty', 'not_empty'].includes(c.op) && <input value={c.op === 'in' ? (Array.isArray(c.value) ? c.value.join(',') : '') : String(c.value ?? '')} onChange={(e) => setCond(i, { value: c.op === 'in' ? e.target.value.split(',').map((s) => s.trim()) : e.target.value })} placeholder={c.op === 'in' ? t('set.auto.commaSep') : t('common.value')} />}
          <button className="small danger" type="button" onClick={() => setA({ ...a, conditions: conds.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <datalist id="field-hints">{fieldHints.map((f) => <option key={f} value={f} />)}</datalist>
      <button className="small" type="button" onClick={() => setA({ ...a, conditions: [...conds, { field: 'lead.source', op: 'eq', value: '' }] })}>{t('set.auto.addCondition')}</button>
      <h3 style={{ marginTop: 14 }}>{t('set.auto.actions')}</h3>
      {acts.map((x, i) => {
        const ty = String(x.type);
        return (
          <div key={i} className="panel" style={{ padding: 8, marginBottom: 6 }}>
            <div className="row"><select value={ty} onChange={(e) => setAct(i, { type: e.target.value })}>{ACTIONS.map((k) => <option key={k} value={k}>{label(t, 'action', k)}</option>)}</select><button className="small danger" type="button" onClick={() => setA({ ...a, actions: acts.filter((_, j) => j !== i) })}>×</button></div>
            {ty === 'assign_user' && <select style={{ marginTop: 6 }} value={String(x.userId ?? '')} onChange={(e) => setAct(i, { userId: e.target.value })}><option value="">{t('set.auto.manager')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
            {ty === 'move_stage' && <select style={{ marginTop: 6 }} value={String(x.stageId ?? '')} onChange={(e) => setAct(i, { stageId: e.target.value })}><option value="">{t('set.auto.stage')}</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
            {ty === 'send_message' && <select style={{ marginTop: 6 }} value={String(x.channel ?? '')} onChange={(e) => setAct(i, { channel: e.target.value })}><option value="">{t('set.auto.channel')}</option>{SEND_CHANNELS.map((c) => <option key={c} value={c}>{label(t, 'channel', c)}</option>)}</select>}
            {ty === 'send_message' && String(x.channel) === 'EMAIL' && <input style={{ marginTop: 6 }} placeholder={t('set.auto.subject')} value={String(x.subject ?? '')} onChange={(e) => setAct(i, { subject: e.target.value })} />}
            {['reply_same_channel', 'send_message', 'add_note'].includes(ty) && <textarea style={{ marginTop: 6 }} placeholder={t('set.auto.textPh')} value={String(x.text ?? '')} onChange={(e) => setAct(i, { text: e.target.value })} />}
            {ty === 'create_task' && <div className="row" style={{ marginTop: 6 }}><input placeholder={t('set.auto.taskTitle')} value={String(x.title ?? '')} onChange={(e) => setAct(i, { title: e.target.value })} /><input type="number" style={{ width: 110 }} placeholder={t('set.auto.inHours')} value={String(x.dueInHours ?? '')} onChange={(e) => setAct(i, { dueInHours: e.target.value ? Number(e.target.value) : undefined })} /><label className="small row" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!x.assignToOwner} onChange={(e) => setAct(i, { assignToOwner: e.target.checked })} /> {t('set.auto.toOwner')}</label></div>}
            {ty === 'webhook' && <input style={{ marginTop: 6 }} placeholder="https://…" value={String(x.url ?? '')} onChange={(e) => setAct(i, { url: e.target.value })} />}
          </div>
        );
      })}
      <button className="small" type="button" onClick={() => setA({ ...a, actions: [...acts, { type: 'create_task', title: '' }] })}>{t('set.auto.addAction')}</button>
      <ErrorText error={error} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button type="button" onClick={onClose}>{t('common.cancel')}</button><button className="primary" disabled={!a.name || acts.length === 0} onClick={() => onSave(a)}>{t('common.save')}</button></div>
    </Modal>
  );
}

function Users() {
  const { t } = useT();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const [u, setU] = useState({ name: '', email: '', password: '', role: 'MANAGER', locale: 'uk', binotelInternal: '' });
  const create = useMutation({ mutationFn: () => api('/api/users', { body: { ...u, binotelInternal: u.binotelInternal || undefined } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setU({ ...u, name: '', email: '', password: '', binotelInternal: '' }); } });
  const patch = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/api/users/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  return (
    <>
      <table>
        <thead><tr><th>{t('set.users.name')}</th><th>{t('set.users.email')}</th><th>{t('set.users.role')}</th><th>{t('set.users.locale')}</th><th>{t('set.users.internal')}</th><th>{t('set.users.active')}</th></tr></thead>
        <tbody>{users.data?.map((x) => (
          <tr key={x.id}>
            <td>{x.name}</td><td>{x.email}</td>
            <td><select value={x.role} onChange={(e) => patch.mutate({ id: x.id, body: { role: e.target.value } })}>{ROLES.map((r) => <option key={r} value={r}>{label(t, 'role', r)}</option>)}</select></td>
            <td><select value={x.locale ?? 'uk'} onChange={(e) => patch.mutate({ id: x.id, body: { locale: e.target.value } })}>{LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}</select></td>
            <td><input defaultValue={x.binotelInternal ?? ''} onBlur={(e) => patch.mutate({ id: x.id, body: { binotelInternal: e.target.value || null } })} style={{ width: 100 }} /></td>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={x.isActive !== false} onChange={(e) => patch.mutate({ id: x.id, body: { isActive: e.target.checked } })} /></td>
          </tr>
        ))}</tbody>
      </table>
      <ErrorText error={patch.error} />
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>{t('set.users.new')}</h3>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <input style={{ width: 160 }} placeholder={t('set.users.name')} value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} required />
          <input style={{ width: 200 }} type="email" placeholder={t('set.users.email')} value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} required />
          <input style={{ width: 140 }} type="password" placeholder={t('set.users.password')} value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} required />
          <select style={{ width: 150 }} value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{label(t, 'role', r)}</option>)}</select>
          <select style={{ width: 130 }} value={u.locale} onChange={(e) => setU({ ...u, locale: e.target.value })}>{LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}</select>
          <input style={{ width: 120 }} placeholder={t('set.users.internalPh')} value={u.binotelInternal} onChange={(e) => setU({ ...u, binotelInternal: e.target.value })} />
          <button className="primary">{t('common.create')}</button>
        </form>
        <ErrorText error={create.error} />
      </div>
    </>
  );
}

function Channels() {
  const { t } = useT();
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<{ type: string; configured: boolean; canSend: boolean }[]>('/api/channels') });
  const setup = useMutation({ mutationFn: (path: string) => api(path, { method: 'POST', body: {} }) });
  return (
    <table>
      <thead><tr><th>{t('set.ch.channel')}</th><th>{t('set.ch.status')}</th><th>{t('set.ch.send')}</th><th>{t('set.ch.setup')}</th><th></th></tr></thead>
      <tbody>
        {channels.data?.map((c) => (
          <tr key={c.type}>
            <td>{label(t, 'channel', c.type)}</td>
            <td>{c.configured ? <span style={{ color: 'var(--ok)' }}>{t('set.ch.configured')}</span> : <span className="muted">{t('set.ch.notConfigured')}</span>}</td>
            <td>{c.canSend ? t('common.yes') : t('set.ch.receiveOnly')}</td>
            <td className="small muted">{t(`set.ch.hint.${c.type}`)}</td>
            <td>{(c.type === 'TELEGRAM' || c.type === 'VIBER') && c.configured && <button className="small" onClick={() => setup.mutate(`/webhooks/${c.type.toLowerCase()}/setup`)}>{t('set.ch.register')}</button>}</td>
          </tr>
        ))}
      </tbody>
      {setup.data ? <tfoot><tr><td colSpan={5}><pre>{JSON.stringify(setup.data, null, 2)}</pre></td></tr></tfoot> : null}
    </table>
  );
}

function Logs() {
  const { t } = useT();
  const { fmtDate } = useFormat();
  const [errors, setErrors] = useState(false);
  const logs = useQuery({ queryKey: ['webhook-logs', errors], queryFn: () => api<{ id: string; channel: string; payload: unknown; error?: string | null; processedAt?: string | null; createdAt: string }[]>('/api/webhook-logs', { query: { errors: errors || undefined } }) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <label className="row small" style={{ marginBottom: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={errors} onChange={(e) => setErrors(e.target.checked)} /> {t('set.logs.errorsOnly')}</label>
      <table>
        <thead><tr><th>{t('set.logs.when')}</th><th>{t('set.logs.channel')}</th><th>{t('set.logs.result')}</th><th></th></tr></thead>
        <tbody>
          {logs.data?.map((l) => (
            <tr key={l.id}>
              <td>{fmtDate(l.createdAt)}</td><td>{l.channel}</td>
              <td>{l.error ? <span className="error">{l.error.split('\n')[0]}</span> : l.processedAt ? 'ok' : '…'}</td>
              <td><button className="small" onClick={() => setOpen(open === l.id ? null : l.id)}>payload</button>{open === l.id && <pre>{JSON.stringify(l.payload, null, 2)}</pre>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
