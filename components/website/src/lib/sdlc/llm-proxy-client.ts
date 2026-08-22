// components/website/src/lib/sdlc/llm-proxy-client.ts
// Kapselt alle Proxy-Anfragen des Cockpits und klassifiziert Fehler in drei Zustaende.

const DEFAULT_PROXY_URL = 'http://127.0.0.1:18235';
const PROXY_TIMEOUT_MS = 1500;

export interface ProxyFailure {
  kind: 'unreachable' | 'unauthorized' | 'error';
  address: string;
  message: string;
}

export function getProxyUrl(): string {
  return process.env.LLM_PROXY_URL ?? DEFAULT_PROXY_URL;
}

export function classifyProxyError(err: unknown, status?: number): ProxyFailure {
  const address = getProxyUrl();
  if (status === 401 || status === 403) {
    return {
      kind: 'unauthorized',
      address,
      message: 'Authentifizierung am LLM-Proxy fehlgeschlagen (Token ungueltig oder nicht gesetzt)',
    };
  }

  if (typeof status === 'number' && (status < 200 || status >= 300)) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : `HTTP ${status}`;
    return {
      kind: 'error',
      address,
      message: msg,
    };
  }

  const errMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  return {
    kind: 'unreachable',
    address,
    message: errMessage,
  };
}

export async function proxyFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = getProxyUrl();
  const token = process.env.LLM_PROXY_ADMIN_TOKEN;

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener('abort', () => ctrl.abort());
  }

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
