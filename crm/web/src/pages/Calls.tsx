import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Call } from '../api';
import { CALL_STATUS, fmtDate, fmtDuration, fmtPhone } from '../i18n';

export default function CallsPage() {
  const [status, setStatus] = useState('');
  const calls = useQuery({ queryKey: ['calls', status], queryFn: () => api<Call[]>('/api/calls', { query: { status, limit: 200 } }), refetchInterval: 20_000 });
  return (
    <>
      <div className="page-head"><h1>Звонки</h1>
        <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все</option>{Object.entries(CALL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <table>
        <thead><tr><th>Когда</th><th></th><th>Номер</th><th>Клиент</th><th>Статус</th><th>Длит.</th><th>Менеджер</th><th>Запись</th></tr></thead>
        <tbody>
          {calls.data?.map((c) => (
            <tr key={c.id}>
              <td>{fmtDate(c.startedAt)}</td><td>{c.direction === 'IN' ? '↙' : '↗'}</td><td>{fmtPhone(c.phone)}</td>
              <td>{c.contact ? <Link to={c.lead ? `/leads/${c.lead.id}` : `/contacts/${c.contact.id}`}>{c.contact.name}</Link> : ''}</td>
              <td className={c.status === 'MISSED' ? 'error' : ''}>{CALL_STATUS[c.status] ?? c.status}</td>
              <td>{fmtDuration(c.durationSec)}</td><td>{c.user?.name ?? c.internal}</td>
              <td style={{ width: 260 }}>{c.recordingUrl && <audio controls preload="none" src={c.recordingUrl} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
