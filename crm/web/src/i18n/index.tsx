import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { uk, type Dict } from './uk';
import { sk } from './sk';
import { ru } from './ru';

export type Locale = 'uk' | 'sk' | 'ru';
export const LOCALES: Locale[] = ['uk', 'sk', 'ru'];
const dicts: Record<Locale, Dict> = { uk, sk, ru };
const KEY = 'crm.locale';
const INTL: Record<Locale, string> = { uk: 'uk-UA', sk: 'sk-SK', ru: 'ru-RU' };

export type TKey = keyof Dict;
export type TFn = (key: TKey | string, vars?: Record<string, string | number>) => string;

function readStored(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'uk' || v === 'sk' || v === 'ru') return v;
  } catch { /* ignore */ }
  return 'uk';
}

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: TFn }>({ locale: 'uk', setLocale: () => {}, t: (k) => String(k) });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStored);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);
  const t = useMemo<TFn>(() => {
    const d = dicts[locale];
    return (key, vars) => {
      let s = (d as Record<string, string>)[key] ?? (uk as Record<string, string>)[key] ?? String(key);
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    };
  }, [locale]);
  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}

/** Подписи по справочным значениям из API: канал, роль, статус звонка и т.п. */
export function label(t: TFn, prefix: 'channel' | 'identity' | 'callStatus' | 'trigger' | 'action' | 'op' | 'role', value: string) {
  const key = `${prefix}.${value}`;
  const s = t(key);
  return s === key ? value : s;
}

export function useFormat() {
  const { locale } = useT();
  const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString(INTL[locale], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const fmtNumber = (n: number) => n.toLocaleString(INTL[locale]);
  return { fmtDate, fmtNumber };
}

export function fmtPhone(v: string) {
  if (/^380\d{9}$/.test(v)) return `+380 ${v.slice(3, 5)} ${v.slice(5, 8)} ${v.slice(8, 10)} ${v.slice(10)}`;
  if (/^421\d{9}$/.test(v)) return `+421 ${v.slice(3, 6)} ${v.slice(6, 9)} ${v.slice(9)}`;
  return /^\d+$/.test(v) ? '+' + v : v;
}
export function fmtDuration(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
