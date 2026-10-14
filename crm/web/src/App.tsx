import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, getToken, setToken, type User } from './api';
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
  return useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/auth/me'), enabled: !!getToken() });
}

function Shell() {
  const me = useMe();
  const nav = useNavigate();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<{ unread: number }>('/api/stats'), refetchInterval: 15_000 });
  const tasks = useQuery({ queryKey: ['tasks', 'mine-open'], queryFn: () => api<unknown[]>('/api/tasks', { query: { mine: true } }), refetchInterval: 30_000 });
  if (!getToken()) return <Navigate to="/login" />;
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
        {link('/', 'Сводка')}
        {link('/pipeline', 'Воронка')}
        {link('/inbox', 'Инбокс', stats.data?.unread)}
        {link('/contacts', 'Контакты')}
        {link('/tasks', 'Задачи', tasks.data?.length)}
        {link('/calls', 'Звонки')}
        {me.data?.role === 'ADMIN' && link('/settings', 'Настройки')}
        <div className="bottom">
          <div>{me.data?.name}</div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setToken(null);
              nav('/login');
            }}
            style={{ padding: 0 }}
          >
            Выйти
          </a>
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
