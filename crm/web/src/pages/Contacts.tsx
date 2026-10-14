import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type Contact } from '../api';
import { ErrorText, Field, Modal, useDebounce } from '../components/ui';
import { fmtPhone, IDENTITY_LABELS } from '../i18n';

export default function ContactsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const d = useDebounce(search);
  const list = useQuery({ queryKey: ['contacts', d], queryFn: () => api<{ items: Contact[]; total: number }>('/api/contacts', { query: { search: d, limit: 100 } }) });
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const create = useMutation({
    mutationFn: () => api<Contact>('/api/contacts', { body: { name, companyName: company || undefined, identities: [phone && { type: 'PHONE', value: phone }, email && { type: 'EMAIL', value: email }].filter(Boolean) } }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['contacts'] }); setCreating(false); nav(`/contacts/${c.id}`); },
  });
  return (
    <>
      <div className="page-head"><h1>Контакты</h1><input style={{ width: 260 }} placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} /><span className="muted small">{list.data?.total ?? ''}</span><span className="grow" /><button className="primary" onClick={() => setCreating(true)}>+ Контакт</button></div>
      <table>
        <thead><tr><th>Имя</th><th>Компания</th><th>Контакты</th><th>Лидов</th></tr></thead>
        <tbody>
          {list.data?.items.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => nav(`/contacts/${c.id}`)}>
              <td>{c.name}</td><td>{c.companyName}</td>
              <td>{c.identities.map((i) => <span key={i.id} className="chip">{IDENTITY_LABELS[i.type]}: {i.type === 'PHONE' ? fmtPhone(i.value) : i.value}</span>)}</td>
              <td>{c._count?.leads}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {creating && (
        <Modal title="Новый контакт" onClose={() => setCreating(false)}>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Имя"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Компания"><input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            <Field label="Телефон"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <ErrorText error={create.error} />
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={() => setCreating(false)}>Отмена</button><button className="primary" disabled={!phone && !email}>Создать</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
