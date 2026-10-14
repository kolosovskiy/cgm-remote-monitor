import { useEffect, useState, type ReactNode } from 'react';
import { CHANNEL_LABELS, fmtPhone, IDENTITY_LABELS } from '../i18n';
import type { FieldDef, Identity } from '../api';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ChannelChip({ channel }: { channel: string }) {
  return <span className={`chip ch-${channel}`}>{CHANNEL_LABELS[channel] ?? channel}</span>;
}

export function IdentityLine({ i }: { i: Identity }) {
  const v = i.type === 'PHONE' || i.type === 'WHATSAPP' ? fmtPhone(i.value) : i.value;
  const href = i.type === 'PHONE' ? `tel:+${i.value}` : i.type === 'EMAIL' ? `mailto:${i.value}` : undefined;
  return (
    <div className="row small">
      <span className="muted" style={{ width: 80 }}>{IDENTITY_LABELS[i.type] ?? i.type}</span>
      {href ? <a href={href}>{v}</a> : <span>{v}</span>}
      {i.label && <span className="muted">{i.label}</span>}
    </div>
  );
}

/** Редактор настраиваемых полей по определениям FieldDefinition. */
export function CustomFields({ defs, value, onChange }: { defs: FieldDef[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  if (defs.length === 0) return null;
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <>
      {defs.map((d) => {
        const v = value[d.key];
        return (
          <Field key={d.id} label={d.label + (d.required ? ' *' : '')}>
            {d.type === 'SELECT' ? (
              <select value={String(v ?? '')} onChange={(e) => set(d.key, e.target.value)}>
                <option value="">—</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : d.type === 'BOOL' ? (
              <input type="checkbox" style={{ width: 'auto' }} checked={!!v} onChange={(e) => set(d.key, e.target.checked)} />
            ) : (
              <input type={d.type === 'NUMBER' ? 'number' : d.type === 'DATE' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => set(d.key, d.type === 'NUMBER' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
            )}
          </Field>
        );
      })}
    </>
  );
}

export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="error small">{(error as Error).message}</div>;
}
