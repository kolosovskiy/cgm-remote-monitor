import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { ErrorText, Field } from '../components/ui';
import { LOCALES, useT, type Locale } from '../i18n';

export default function Login() {
  const { t, locale, setLocale } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: { locale?: Locale } }>('/api/auth/login', { body: { email, password } });
      setToken(res.token);
      if (res.user.locale) setLocale(res.user.locale);
      nav('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <div className="row"><h2 style={{ margin: 0 }} className="grow">{t('login.title')}</h2>
          <select style={{ width: 'auto' }} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>{LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}</select></div>
        <div style={{ height: 12 }} />
        <Field label={t('login.email')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></Field>
        <Field label={t('login.password')}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorText error={error} />
        <button className="primary" disabled={busy} style={{ width: '100%', marginTop: 8 }}>{t('login.submit')}</button>
      </form>
    </div>
  );
}
