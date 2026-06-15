export class HttpError extends Error {
  constructor(
    public status: number,
    public method: string,
    public path: string,
    public body?: unknown,
  ) {
    super(`${method} ${path} failed: ${status}`);
    this.name = 'HttpError';
  }
}

const E2E_MSW_ENABLED = (import.meta as any)?.env?.VITE_E2E_MSW === 'true';

export class ApiClient {
  private static csrfToken: string | null = null;
  private static csrfPromise: Promise<string | null> | null = null;

  private static async getCsrfToken(): Promise<string | null> {
    if (E2E_MSW_ENABLED) return null; // tests/e2e skip
    if (ApiClient.csrfToken) return ApiClient.csrfToken;
    if (ApiClient.csrfPromise) return ApiClient.csrfPromise;
    ApiClient.csrfPromise = (async () => {
      try {
        const res = await fetch('/api/csrf', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { csrfToken?: string | null };
        ApiClient.csrfToken = data?.csrfToken || null;
        return ApiClient.csrfToken;
      } catch {
        return null;
      } finally {
        ApiClient.csrfPromise = null;
      }
    })();
    return ApiClient.csrfPromise;
  }

  private static async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (method !== 'GET') headers['Content-Type'] = 'application/json';

    // Attach CSRF token for mutating requests
    if (method !== 'GET') {
      const token = await ApiClient.getCsrfToken();
      if (token) headers['X-CSRF-Token'] = token;
    }

    if (typeof window !== 'undefined') {
      const accessToken = window.localStorage.getItem('accessToken');
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    const res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: method === 'GET' ? undefined : body ? JSON.stringify(body) : undefined,
    });

    // If CSRF failed, try to refresh token once and retry
    if (res.status === 403 && method !== 'GET') {
      try {
        ApiClient.csrfToken = null;
        await ApiClient.getCsrfToken();
        const retryHeaders: Record<string, string> = { ...headers };
        if (ApiClient.csrfToken) retryHeaders['X-CSRF-Token'] = ApiClient.csrfToken;
        const retryRes = await fetch(path, {
          method,
          headers: retryHeaders,
          credentials: 'include',
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok)
          throw new HttpError(retryRes.status, method, path, await safeJson(retryRes));
        return (await safeJson(retryRes)) as T;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(403, method, path);
      }
    }

    if (!res.ok) throw new HttpError(res.status, method, path, await safeJson(res));
    return (await safeJson(res)) as T;
  }

  static async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  static async post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  static async patch<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  static async delete<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
  return undefined;
}
