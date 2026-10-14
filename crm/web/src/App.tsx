import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken, type User } from './api';
import { LOCALES, useT, type Locale } from './i18n';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PipelinePage from './pages/Pipeline';
import LeadPage from './pages/Lead';
import InboxPage from './pages/Inbox';
import ContactsPage from './pages/Contacts';
import ContactPage from './pages/Contact';
import TasksPage from './pages/Tasks';
import CallsPage from './pages/Calls';
import SettingsPage from './pages/Settings';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/auth/me'), enabled: !!getToken(), staleTime: 60_000 });
}

export function useCan() {
  const me = useMe();
  return (perm: string) => !!me.data?.permissions?.includes(perm);
}

function Shell() {
  const me = useMe();
  const can = useCan();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { t, locale, setLocale } = useT();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<{ unread: number }>('/api/stats'), refetchInterval: 15_000 });
  const tasks = useQuery({ queryKey: ['tasks', 'mine-open'], queryFn: () => api<unknown[]>('/api/tasks', { query: { mine: true } }), refetchInterval: 30_000 });
  // Язык из профиля пользователя имеет приоритет над сохранённым в браузере.
  useEffect(() => {
    if (me.data?.locale && me.data.locale !== locale) setLocale(me.data.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.locale]);
  if (!getToken()) return <Navigate to="/login" />;
  const changeLocale = async (l: Locale) => {
    setLocale(l);
    await api('/api/me', { method: 'PATCH', body: { locale: l } }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  const link = (to: string, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span className="txt">{label}</span>
      {badge ? <span className="badge">{badge}</span> : null}
    </NavLink>
  );
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">CRM</div>
        {link('/', t('nav.dashboard'))}
        {link('/pipeline', t('nav.pipeline'))}
        {link('/inbox', t('nav.inbox'), stats.data?.unread)}
        {link('/contacts', t('nav.contacts'))}
        {link('/tasks', t('nav.tasks'), tasks.data?.length)}
        {link('/calls', t('nav.calls'))}
        {(can('settings.manage') || can('users.manage')) && link('/settings', t('nav.settings'))}
        <div className="bottom">
          <div>{me.data?.name}</div>
          <div className="muted small">{me.data?.role && t(`role.${me.data.role}`)}</div>
          <select value={locale} onChange={(e) => changeLocale(e.target.value as Locale)} style={{ margin: '8px 0', background: '#1f2937', color: '#fff', border: 0 }} aria-label={t('nav.language')}>
            {LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
          </select>
          <a href="#" onClick={(e) => { e.preventDefault(); setToken(null); qc.clear(); nav('/login'); }} style={{ padding: 0 }}>{t('nav.logout')}</a>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/leads/:id" element={<LeadPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/inbox/:id" element={<InboxPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Shell />} />
    </Routes>
  );
}
