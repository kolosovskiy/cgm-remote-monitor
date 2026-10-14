const TOKEN_KEY = 'crm.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await fetch(path + qs, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.includes('/auth/login')) {
    setToken(null);
    window.location.href = '/login';
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.issues);
  return data as T;
}

// Типы ответов API (подмножество, достаточное для интерфейса)
export type User = { id: string; email: string; name: string; role: 'ADMIN' | 'MANAGER'; binotelInternal?: string | null; isActive?: boolean };
export type Identity = { id: string; type: string; value: string; label?: string | null };
export type Contact = { id: string; name: string; companyName?: string | null; customFields: Record<string, unknown>; identities: Identity[]; _count?: { leads: number } };
export type Stage = { id: string; pipelineId: string; name: string; position: number; color: string; isWon: boolean; isLost: boolean };
export type Pipeline = { id: string; name: string; isDefault: boolean; stages: Stage[] };
export type Message = { id: string; direction: 'IN' | 'OUT'; channel: string; text: string; attachments: { url: string; name?: string; mime?: string }[]; status: string; error?: string | null; createdAt: string; author?: { id: string; name: string } | null };
export type Conversation = { id: string; channel: string; externalId: string; subject?: string | null; lastMessageAt: string; unreadCount: number; contact: Contact; lead?: { id: string; title: string; ownerId?: string | null } | null; messages: Message[] };
export type Call = { id: string; direction: 'IN' | 'OUT'; phone: string; internal?: string | null; status: string; durationSec: number; waitSec: number; recordingUrl?: string | null; startedAt: string; user?: { id: string; name: string } | null; contact?: Contact | null; lead?: { id: string; title: string } | null };
export type Task = { id: string; title: string; dueAt?: string | null; doneAt?: string | null; assignee?: { id: string; name: string } | null; lead?: { id: string; title: string } | null; contact?: { id: string; name: string } | null };
export type Note = { id: string; text: string; createdAt: string; author?: { id: string; name: string } | null };
export type Lead = {
  id: string;
  title: string;
  contactId: string;
  contact: Contact;
  pipelineId: string;
  pipeline?: Pipeline;
  stageId: string;
  stage: Stage;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  source: string;
  sourceDetail?: string | null;
  amount?: string | number | null;
  currency: string;
  status: 'OPEN' | 'WON' | 'LOST';
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number; conversations: number };
  conversations?: Conversation[];
  calls?: Call[];
  tasks?: Task[];
  notes?: Note[];
  stageHistory?: { id: string; fromStage?: string | null; toStage: string; createdAt: string }[];
};
export type FieldDef = { id: string; entity: 'LEAD' | 'CONTACT'; key: string; label: string; type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOL'; options: string[]; required: boolean };
export type Automation = { id: string; name: string; trigger: string; conditions: { field: string; op: string; value?: unknown }[]; actions: Record<string, unknown>[]; enabled: boolean };
