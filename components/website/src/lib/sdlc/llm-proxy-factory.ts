// components/website/src/lib/sdlc/llm-proxy-factory.ts
// Durchreichschicht zum Factory-Default des llm-proxy (GET/PUT /admin/factory).
// Der Default lebt in scripts/llm/loadouts.json (factory.model) und wird vom
// Proxy mit mtimeMs gegen konkurrierende Schreibvorgänge geschützt — dieser
// Wert wandert unverändert in beide Richtungen durch, damit die Website denselben
// Optimismus führt wie das Proxy-UI.

const PROXY_URL = process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235';
const PROXY_TIMEOUT_MS = 1500;

export interface FactoryLoadoutOption {
  slug: string;
  label: string;
  port: number;
}

export interface FactoryDefault {
  model: string | null;
  locked: boolean;
  mtimeMs: number;
  selectable: FactoryLoadoutOption[];
}

export interface FactoryWriteResult {
  saved: boolean;
  mtimeMs: number;
}

/** Der Proxy antwortet nicht — der Zustand ist auszusprechen, nicht zu verstecken. */
export class FactoryProxyOfflineError extends Error {
  constructor(cause?: unknown) {
    super('llm-proxy nicht erreichbar');
    this.name = 'FactoryProxyOfflineError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Ein anderer Schreibzugriff war schneller (mtimeMs veraltet) — HTTP 409 des Proxy. */
export class FactoryWriteConflictError extends Error {
  constructor(message = 'Factory-Default wurde zwischenzeitlich geändert') {
    super(message);
    this.name = 'FactoryWriteConflictError';
  }
}

async function proxyFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(`${PROXY_URL}${path}`, { ...init, signal: ctrl.signal });
  } catch (err) {
    throw new FactoryProxyOfflineError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function readFactoryDefault(): Promise<FactoryDefault> {
  const res = await proxyFetch('/admin/factory');
  if (!res.ok) {
    throw new Error(`llm-proxy /admin/factory antwortete HTTP ${res.status}`);
  }
  const body = (await res.json()) as Partial<FactoryDefault>;
  return {
    model: typeof body.model === 'string' ? body.model : null,
    locked: body.locked === true,
    mtimeMs: typeof body.mtimeMs === 'number' ? body.mtimeMs : 0,
    selectable: Array.isArray(body.selectable)
      ? body.selectable.filter(
          (s): s is FactoryLoadoutOption =>
            typeof s?.slug === 'string' && typeof s?.port === 'number',
        )
      : [],
  };
}

export async function writeFactoryDefault(
  model: string,
  locked: boolean,
  mtimeMs: number,
): Promise<FactoryWriteResult> {
  let res: Response;
  try {
    res = await proxyFetch('/admin/factory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, locked, mtimeMs }),
    });
  } catch (err) {
    if (err instanceof FactoryProxyOfflineError) throw err;
    throw new FactoryProxyOfflineError(err);
  }
  if (res.status === 409) {
    throw new FactoryWriteConflictError();
  }
  if (!res.ok) {
    throw new Error(`llm-proxy PUT /admin/factory antwortete HTTP ${res.status}`);
  }
  const body = (await res.json()) as { saved?: boolean; mtimeMs?: number };
  return { saved: body.saved === true, mtimeMs: typeof body.mtimeMs === 'number' ? body.mtimeMs : 0 };
}
