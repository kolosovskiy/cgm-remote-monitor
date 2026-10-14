import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, type Automation, type FieldDef, type Pipeline, type User } from '../api';
import { ErrorText, Field, Modal } from '../components/ui';
import { ACTION_LABELS, CHANNEL_LABELS, fmtDate, OP_LABELS, TRIGGER_LABELS } from '../i18n';

export default function SettingsPage() {
  const tabs = [['pipelines', 'Воронки'], ['fields', 'Поля'], ['automations', 'Автоматизации'], ['users', 'Пользователи'], ['channels', 'Каналы'], ['logs', 'Журнал вебхуков']];
  return (
    <>
      <div className="page-head"><h1>Настройки</h1></div>
      <div className="tabs">{tabs.map(([k, l]) => <NavLink key={k} to={`/settings/${k}`}>{({ isActive }) => <button className={isActive ? 'active' : ''}>{l}</button>}</NavLink>)}</div>
      <Routes>
        <Route path="pipelines" element={<Pipelines />} />
        <Route path="fields" element={<Fields />} />
        <Route path="automations" element={<Automations />} />
        <Route path="users" element={<Users />} />
        <Route path="channels" element={<Channels />} />
        <Route path="logs" element={<Logs />} />
        <Route path="*" element={<Navigate to="/settings/pipelines" />} />
      </Routes>
    </>
  );
}

function Pipelines() {
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
  return (
    <>
      {pipelines.data?.map((p) => (
        <div className="panel" key={p.id}>
          <div className="row"><input style={{ width: 260, fontWeight: 600 }} defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && patchP.mutate({ id: p.id, body: { name: e.target.value } })} />
            {p.isDefault ? <span className="chip">по умолчанию</span> : <button className="small" onClick={() => patchP.mutate({ id: p.id, body: { isDefault: true } })}>сделать основной</button>}
            <span className="grow" /><button className="small danger" onClick={() => confirm('Удалить воронку?') && delP.mutate(p.id)}>Удалить</button></div>
          <table style={{ marginTop: 10 }}>
            <tbody>
              {p.stages.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ width: 60 }}><button className="small" disabled={i === 0} onClick={() => { const ids = p.stages.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; order.mutate({ id: p.id, stageIds: ids }); }}>↑</button> <button className="small" disabled={i === p.stages.length - 1} onClick={() => { const ids = p.stages.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; order.mutate({ id: p.id, stageIds: ids }); }}>↓</button></td>
                  <td><input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && patchS.mutate({ id: s.id, body: { name: e.target.value } })} /></td>
                  <td style={{ width: 60 }}><input type="color" defaultValue={s.color} onBlur={(e) => patchS.mutate({ id: s.id, body: { color: e.target.value } })} /></td>
                  <td style={{ width: 220 }}>
                    <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={s.isWon} onChange={(e) => patchS.mutate({ id: s.id, body: { isWon: e.target.checked, isLost: false } })} /> успех</label>{' '}
                    <label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={s.isLost} onChange={(e) => patchS.mutate({ id: s.id, body: { isLost: e.target.checked, isWon: false } })} /> отказ</label>
                  </td>
                  <td style={{ width: 40 }}><button className="small danger" onClick={() => delS.mutate(s.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('n') as HTMLInputElement; if (f.value) { addS.mutate({ id: p.id, name: f.value }); f.value = ''; } }}>
            <input name="n" placeholder="Новый этап…" style={{ width: 260 }} /><button>Добавить этап</button>
          </form>
        </div>
      ))}
      <div className="panel"><form className="row" onSubmit={(e) => { e.preventDefault(); createP.mutate(); }}><input style={{ width: 260 }} placeholder="Название новой воронки" value={newName} onChange={(e) => setNewName(e.target.value)} /><button className="primary" disabled={!newName}>Создать воронку</button></form></div>
      <ErrorText error={err} />
    </>
  );
}

function Fields() {
  const qc = useQueryClient();
  const fields = useQuery({ queryKey: ['fields'], queryFn: () => api<FieldDef[]>('/api/fields') });
  const [f, setF] = useState({ entity: 'LEAD', key: '', label: '', type: 'TEXT', options: '', required: false });
  const create = useMutation({ mutationFn: () => api('/api/fields', { body: { ...f, options: f.options.split(',').map((s) => s.trim()).filter(Boolean) } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields'] }); setF({ ...f, key: '', label: '', options: '' }); } });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/fields/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['fields'] }) });
  return (
    <>
      <table>
        <thead><tr><th>Сущность</th><th>Ключ</th><th>Название</th><th>Тип</th><th>Варианты</th><th></th></tr></thead>
        <tbody>{fields.data?.map((d) => <tr key={d.id}><td>{d.entity === 'LEAD' ? 'Лид' : 'Контакт'}</td><td><code>{d.key}</code></td><td>{d.label}{d.required && ' *'}</td><td>{d.type}</td><td>{d.options.join(', ')}</td><td><button className="small danger" onClick={() => del.mutate(d.id)}>×</button></td></tr>)}</tbody>
      </table>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Новое поле</h3>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <select style={{ width: 120 }} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="LEAD">Лид</option><option value="CONTACT">Контакт</option></select>
          <input style={{ width: 140 }} placeholder="ключ (latin_snake)" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
          <input style={{ width: 200 }} placeholder="Название" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <select style={{ width: 120 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOL'].map((t) => <option key={t}>{t}</option>)}</select>
          {f.type === 'SELECT' && <input style={{ width: 260 }} placeholder="варианты через запятую" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />}
          <label className="small row"><input type="checkbox" style={{ width: 'auto' }} checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> обязательное</label>
          <button className="primary" disabled={!f.key || !f.label}>Добавить</button>
        </form>
        <ErrorText error={create.error} />
      </div>
    </>
  );
}

function Automations() {
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
    const t = String(a.type);
    const extra = t === 'move_stage' ? pipelines.data?.flatMap((p) => p.stages).find((s) => s.id === a.stageId)?.name : t === 'assign_user' ? users.data?.find((u) => u.id === a.userId)?.name : t === 'create_task' ? `«${a.title}»` : t === 'send_message' ? `${CHANNEL_LABELS[String(a.channel)]}: «${String(a.text).slice(0, 40)}»` : t === 'reply_same_channel' || t === 'add_note' ? `«${String(a.text).slice(0, 40)}»` : t === 'webhook' ? String(a.url) : '';
    return `${ACTION_LABELS[t] ?? t}${extra ? ` → ${extra}` : ''}`;
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}><span className="muted small">Правила выполняются по порядку. Условия объединяются через И.</span><span className="grow" /><button className="primary" onClick={() => setEditing({ name: '', trigger: 'lead.created', conditions: [], actions: [], enabled: true })}>+ Правило</button></div>
      <table>
        <thead><tr><th></th><th>Название</th><th>Событие</th><th>Условия</th><th>Действия</th><th></th></tr></thead>
        <tbody>
          {data.data?.items.map((a) => (
            <tr key={a.id} style={{ opacity: a.enabled ? 1 : 0.5 }}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={a.enabled} onChange={() => toggle.mutate(a)} /></td>
              <td>{a.name}</td><td>{TRIGGER_LABELS[a.trigger] ?? a.trigger}</td>
              <td className="small">{a.conditions.length === 0 ? <span className="muted">всегда</span> : a.conditions.map((c, i) => <div key={i}><code>{c.field}</code> {OP_LABELS[c.op] ?? c.op} {c.value !== undefined && <code>{JSON.stringify(c.value)}</code>}</div>)}</td>
              <td className="small">{a.actions.map((x, i) => <div key={i}>{describeAction(x)}</div>)}</td>
              <td><button className="small" onClick={() => setEditing(a)}>Изм.</button> <button className="small danger" onClick={() => del.mutate(a.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <AutomationEditor value={editing} triggers={data.data?.triggers ?? []} pipelines={pipelines.data ?? []} users={users.data ?? []} onSave={(a) => save.mutate(a)} onClose={() => setEditing(null)} error={save.error} />}
    </>
  );
}

function AutomationEditor({ value, triggers, pipelines, users, onSave, onClose, error }: { value: Partial<Automation>; triggers: string[]; pipelines: Pipeline[]; users: User[]; onSave: (a: Partial<Automation>) => void; onClose: () => void; error: unknown }) {
  const [a, setA] = useState<Partial<Automation>>({ ...value, conditions: value.conditions ?? [], actions: value.actions ?? [] });
  const conds = a.conditions ?? [];
  const acts = a.actions ?? [];
  const setCond = (i: number, patch: Record<string, unknown>) => setA({ ...a, conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAct = (i: number, patch: Record<string, unknown>) => setA({ ...a, actions: acts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const stages = pipelines.flatMap((p) => p.stages.map((s) => ({ ...s, label: `${p.name} / ${s.name}` })));
  const fieldHints = ['lead.source', 'lead.stageId', 'lead.ownerId', 'lead.amount', 'lead.customFields.service', 'contact.name', 'contact.customFields.city', 'message.channel', 'message.text', 'call.status', 'call.direction', 'leadCreated'];
  return (
    <Modal title={a.id ? 'Правило' : 'Новое правило'} onClose={onClose}>
      <Field label="Название"><input value={a.name ?? ''} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
      <Field label="Событие"><select value={a.trigger} onChange={(e) => setA({ ...a, trigger: e.target.value })}>{triggers.map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t] ?? t}</option>)}</select></Field>
      <h3>Условия</h3>
      {conds.map((c, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input list="field-hints" style={{ width: 180 }} value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} placeholder="поле" />
          <select style={{ width: 120 }} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{Object.entries(OP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {!['empty', 'not_empty'].includes(c.op) && <input value={c.op === 'in' ? (Array.isArray(c.value) ? c.value.join(',') : '') : String(c.value ?? '')} onChange={(e) => setCond(i, { value: c.op === 'in' ? e.target.value.split(',').map((s) => s.trim()) : e.target.value })} placeholder={c.op === 'in' ? 'через запятую' : 'значение'} />}
          <button className="small danger" type="button" onClick={() => setA({ ...a, conditions: conds.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <datalist id="field-hints">{fieldHints.map((f) => <option key={f} value={f} />)}</datalist>
      <button className="small" type="button" onClick={() => setA({ ...a, conditions: [...conds, { field: 'lead.source', op: 'eq', value: '' }] })}>+ условие</button>
      <h3 style={{ marginTop: 14 }}>Действия</h3>
      {acts.map((x, i) => {
        const t = String(x.type);
        return (
          <div key={i} className="panel" style={{ padding: 8, marginBottom: 6 }}>
            <div className="row"><select value={t} onChange={(e) => setAct(i, { type: e.target.value })}>{Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="small danger" type="button" onClick={() => setA({ ...a, actions: acts.filter((_, j) => j !== i) })}>×</button></div>
            {t === 'assign_user' && <select style={{ marginTop: 6 }} value={String(x.userId ?? '')} onChange={(e) => setAct(i, { userId: e.target.value })}><option value="">— менеджер —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
            {t === 'move_stage' && <select style={{ marginTop: 6 }} value={String(x.stageId ?? '')} onChange={(e) => setAct(i, { stageId: e.target.value })}><option value="">— этап —</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
            {t === 'send_message' && <select style={{ marginTop: 6 }} value={String(x.channel ?? '')} onChange={(e) => setAct(i, { channel: e.target.value })}><option value="">— канал —</option>{['EMAIL', 'TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'].map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select>}
            {(t === 'send_message') && String(x.channel) === 'EMAIL' && <input style={{ marginTop: 6 }} placeholder="Тема письма" value={String(x.subject ?? '')} onChange={(e) => setAct(i, { subject: e.target.value })} />}
            {['reply_same_channel', 'send_message', 'add_note'].includes(t) && <textarea style={{ marginTop: 6 }} placeholder="Текст. Переменные: {{contact.name}}, {{lead.title}}" value={String(x.text ?? '')} onChange={(e) => setAct(i, { text: e.target.value })} />}
            {t === 'create_task' && <div className="row" style={{ marginTop: 6 }}><input placeholder="Название задачи" value={String(x.title ?? '')} onChange={(e) => setAct(i, { title: e.target.value })} /><input type="number" style={{ width: 110 }} placeholder="через ч." value={String(x.dueInHours ?? '')} onChange={(e) => setAct(i, { dueInHours: e.target.value ? Number(e.target.value) : undefined })} /><label className="small row" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!x.assignToOwner} onChange={(e) => setAct(i, { assignToOwner: e.target.checked })} /> на владельца</label></div>}
            {t === 'webhook' && <input style={{ marginTop: 6 }} placeholder="https://…" value={String(x.url ?? '')} onChange={(e) => setAct(i, { url: e.target.value })} />}
          </div>
        );
      })}
      <button className="small" type="button" onClick={() => setA({ ...a, actions: [...acts, { type: 'create_task', title: '' }] })}>+ действие</button>
      <ErrorText error={error} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button type="button" onClick={onClose}>Отмена</button><button className="primary" disabled={!a.name || acts.length === 0} onClick={() => onSave(a)}>Сохранить</button></div>
    </Modal>
  );
}

function Users() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const [u, setU] = useState({ name: '', email: '', password: '', role: 'MANAGER', binotelInternal: '' });
  const create = useMutation({ mutationFn: () => api('/api/users', { body: { ...u, binotelInternal: u.binotelInternal || undefined } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setU({ name: '', email: '', password: '', role: 'MANAGER', binotelInternal: '' }); } });
  const patch = useMutation({ mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/api/users/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  return (
    <>
      <table>
        <thead><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Вн. номер Binotel</th><th>Активен</th></tr></thead>
        <tbody>{users.data?.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td><select value={x.role} onChange={(e) => patch.mutate({ id: x.id, body: { role: e.target.value } })}><option value="MANAGER">Менеджер</option><option value="ADMIN">Админ</option></select></td><td><input defaultValue={x.binotelInternal ?? ''} onBlur={(e) => patch.mutate({ id: x.id, body: { binotelInternal: e.target.value || null } })} style={{ width: 100 }} /></td><td><input type="checkbox" style={{ width: 'auto' }} checked={x.isActive !== false} onChange={(e) => patch.mutate({ id: x.id, body: { isActive: e.target.checked } })} /></td></tr>)}</tbody>
      </table>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Новый пользователь</h3>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <input style={{ width: 160 }} placeholder="Имя" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} required />
          <input style={{ width: 200 }} type="email" placeholder="Email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} required />
          <input style={{ width: 140 }} type="password" placeholder="Пароль" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} required />
          <select style={{ width: 120 }} value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}><option value="MANAGER">Менеджер</option><option value="ADMIN">Админ</option></select>
          <input style={{ width: 120 }} placeholder="Вн. номер" value={u.binotelInternal} onChange={(e) => setU({ ...u, binotelInternal: e.target.value })} />
          <button className="primary">Создать</button>
        </form>
        <ErrorText error={create.error} />
      </div>
    </>
  );
}

function Channels() {
  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<{ type: string; configured: boolean; canSend: boolean }[]>('/api/channels') });
  const setup = useMutation({ mutationFn: (path: string) => api(path, { method: 'POST', body: {} }) });
  const hints: Record<string, string> = {
    WEBSITE: 'POST /webhooks/website с заголовком X-Webhook-Secret. Поля: name, phone, email, message, form, page, utm.',
    PHONE: 'Binotel: в кабинете добавьте вебхук «Завершение звонка» на /webhooks/binotel/call-completed?secret=WEBHOOK_SECRET.',
    TELEGRAM: 'Укажите TELEGRAM_BOT_TOKEN и нажмите «Зарегистрировать вебхук».',
    VIBER: 'Укажите VIBER_AUTH_TOKEN и нажмите «Зарегистрировать вебхук».',
    FACEBOOK: 'Meta for Developers: Callback URL /webhooks/meta, verify token = META_VERIFY_TOKEN. Нужен App Review.',
    INSTAGRAM: 'Тот же вебхук, что и Messenger. Подписка instagram → messages.',
    WHATSAPP: 'WhatsApp Cloud API: Callback URL /webhooks/whatsapp. Ответ свободным текстом только в 24-часовом окне.',
    EMAIL: 'IMAP_* для входящих, SMTP_* для исходящих. Опрос ящика раз в IMAP_POLL_SECONDS.',
  };
  return (
    <table>
      <thead><tr><th>Канал</th><th>Статус</th><th>Отправка</th><th>Настройка</th><th></th></tr></thead>
      <tbody>
        {channels.data?.map((c) => (
          <tr key={c.type}>
            <td>{CHANNEL_LABELS[c.type]}</td>
            <td>{c.configured ? <span style={{ color: 'var(--ok)' }}>настроен</span> : <span className="muted">не настроен</span>}</td>
            <td>{c.canSend ? 'да' : 'только приём'}</td>
            <td className="small muted">{hints[c.type]}</td>
            <td>{(c.type === 'TELEGRAM' || c.type === 'VIBER') && c.configured && <button className="small" onClick={() => setup.mutate(`/webhooks/${c.type.toLowerCase()}/setup`)}>Зарегистрировать вебхук</button>}</td>
          </tr>
        ))}
      </tbody>
      {setup.data ? <tfoot><tr><td colSpan={5}><pre>{JSON.stringify(setup.data, null, 2)}</pre></td></tr></tfoot> : null}
    </table>
  );
}

function Logs() {
  const [errors, setErrors] = useState(false);
  const logs = useQuery({ queryKey: ['webhook-logs', errors], queryFn: () => api<{ id: string; channel: string; payload: unknown; error?: string | null; processedAt?: string | null; createdAt: string }[]>('/api/webhook-logs', { query: { errors: errors || undefined } }) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <label className="row small" style={{ marginBottom: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={errors} onChange={(e) => setErrors(e.target.checked)} /> только с ошибками</label>
      <table>
        <thead><tr><th>Когда</th><th>Канал</th><th>Результат</th><th></th></tr></thead>
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
