import type { Client, Level, ProfileField, Session, StandardLevel, StandardProfileField } from './types';

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function jsend<T>(url: string, method: 'POST' | 'PUT' | 'PATCH', body: any): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => jget<{ ok: boolean; service: string }>('/healthz'),

  listClients: () => jget<Client[]>('/api/clients'),
  getClient: (id: string) => jget<Client>(`/api/clients/${id}`),
  createClient: (input: { name: string; initials: string; since?: string; lang?: string; category?: string }) =>
    jsend<Client>('/api/clients', 'POST', input),
  updateClient: (id: string, input: Partial<{ name: string; initials: string; since: string; lang: string; category: string }>) =>
    jsend<Client>(`/api/clients/${id}`, 'PUT', input),

  getProfile: (id: string) => jget<{ fields: ProfileField[] }>(`/api/clients/${id}/profile`),
  upsertProfile: (id: string, fields: ProfileField[]) =>
    jsend<{ fields: ProfileField[] }>(`/api/clients/${id}/profile`, 'PUT', { fields }),

  listSessions: (clientId?: string) =>
    jget<Session[]>(clientId ? `/api/sessions?clientId=${encodeURIComponent(clientId)}` : '/api/sessions'),
  createSession: (input: { clientId: string; title: string; lang?: string; fromTemplate?: string }) =>
    jsend<{ id: string; session: Session; levels: Level[] }>('/api/sessions', 'POST', input),
  getSession: (id: string) => jget<{ session: Session; levels: Level[] }>(`/api/sessions/${id}`),
  updateSessionStatus: (id: string, status: 'aktiv' | 'pausiert' | 'fertig') =>
    jsend<Session>(`/api/sessions/${id}`, 'PATCH', { status }),
  copySessionAsTemplate: (id: string, title?: string) =>
    jsend<{ id: string; session: Session; levels: Level[] }>(`/api/sessions/${id}/copy`, 'POST', { title }),

  upsertLevel: (sessionId: string, n: number, input: Partial<{
    prompt: string; promptIsDefault: boolean; answer: string; notes: string;
    done: boolean; clipboard: Array<{ id: string; text: string }>; reset: boolean;
  }>) => jsend<Level>(`/api/sessions/${sessionId}/levels/${n}`, 'PUT', input),

  getStandardLevels: () => jget<StandardLevel[]>('/api/admin/levels'),
  setStandardLevels: (rows: StandardLevel[]) => jsend<StandardLevel[]>('/api/admin/levels', 'PUT', rows),
  getStandardProfileFields: () => jget<StandardProfileField[]>('/api/admin/profile-fields'),
  setStandardProfileFields: (rows: StandardProfileField[]) =>
    jsend<StandardProfileField[]>('/api/admin/profile-fields', 'PUT', rows),

  llmAnswer: (input: { sessionId: string; levelNo: number; prompt?: string; input: string; profileFields: ProfileField[] }) =>
    jsend<{ answer: string }>('/api/llm/answer', 'POST', input),
  llmTranslate: (input: { text: string; targetLang: string }) =>
    jsend<{ translated: string; rtl: boolean }>('/api/llm/translate', 'POST', input),

  transcribe: async (audio: Blob): Promise<{ text: string }> => {
    const r = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': audio.type || 'audio/webm' },
      credentials: 'same-origin',
      body: audio,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json() as Promise<{ text: string }>;
  },

  getSessionExportUrl: (id: string) => `/api/sessions/${id}/export`,
};
