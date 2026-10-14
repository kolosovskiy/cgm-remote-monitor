import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Call } from '../api';
import { fmtDuration, fmtPhone, label, useFormat, useT } from '../i18n';

const STATUSES = ['ANSWERED', 'MISSED', 'BUSY', 'FAILED'];

export default function CallsPage() {
  const { t } = useT();
  const { fmtDate } = useFormat();
  const [status, setStatus] = useState('');
  const calls = useQuery({ queryKey: ['calls', status], queryFn: () => api<Call[]>('/api/calls', { query: { status, limit: 200 } }), refetchInterval: 20_000 });
  return (
    <>
      <div className="page-head"><h1>{t('calls.title')}</h1>
        <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.all')}</option>{STATUSES.map((k) => <option key={k} value={k}>{label(t, 'callStatus', k)}</option>)}</select>
      </div>
      <table>
        <thead><tr><th>{t('calls.when')}</th><th></th><th>{t('calls.number')}</th><th>{t('calls.client')}</th><th>{t('calls.status')}</th><th>{t('calls.duration')}</th><th>{t('calls.manager')}</th><th>{t('calls.recording')}</th></tr></thead>
        <tbody>
          {calls.data?.map((c) => (
            <tr key={c.id}>
              <td>{fmtDate(c.startedAt)}</td><td>{c.direction === 'IN' ? '↙' : '↗'}</td><td>{fmtPhone(c.phone)}</td>
              <td>{c.contact ? <Link to={c.lead ? `/leads/${c.lead.id}` : `/contacts/${c.contact.id}`}>{c.contact.name}</Link> : ''}</td>
              <td className={c.status === 'MISSED' ? 'error' : ''}>{label(t, 'callStatus', c.status)}</td>
              <td>{fmtDuration(c.durationSec)}</td><td>{c.user?.name ?? c.internal}</td>
              <td style={{ width: 260 }}>{c.recordingUrl && <audio controls preload="none" src={c.recordingUrl} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
