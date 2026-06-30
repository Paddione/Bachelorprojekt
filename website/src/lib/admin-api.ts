/**
 * admin-api.ts
 *
 * Fetch wrapper for admin API endpoints with retry logic, auth handling,
 * and integration with the LiveToasts system via custom events.
 */

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

interface ApiCallOptions {
  retries?: number;
  retryDelay?: number;
}

type ToastKind = 'info' | 'ok' | 'warn' | 'err';

/**
 * Emit a toast notification via custom event.
 * Consumed by LiveToasts.svelte in a parent component.
 */
export function toast(kind: ToastKind, message: string) {
  if (typeof window === 'undefined') return;

  const event = new CustomEvent('admin-toast', {
    detail: { kind, message },
    bubbles: true,
    composed: true
  });
  window.dispatchEvent(event);
}

/**
 * Fetch wrapper for admin API endpoints.
 *
 * Handles:
 * - 401 redirects to /login
 * - HTTP errors with toast feedback
 * - Network retries with exponential backoff
 * - Credentials (cookies) automatically included
 *
 * @param url API endpoint URL
 * @param init Fetch RequestInit (method, body, headers, etc.)
 * @param opts Retry options (retries, retryDelay)
 * @returns Promise resolving to ApiResult<T>
 */
export async function apiCall<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: ApiCallOptions = {}
): Promise<ApiResult<T>> {
  const { retries = 1, retryDelay = 3000 } = opts;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, credentials: 'include' });

      // 401: redirect to login
      if (res.status === 401) {
        const returnTo = encodeURIComponent(window.location.pathname);
        window.location.assign(`/login?return_to=${returnTo}`);
        return { ok: false, error: 'Bitte erneut anmelden', status: 401 };
      }

      // Parse JSON response
      let json: unknown = {};
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        json = await res.json().catch(() => ({}));
      }

      // Non-2xx status
      if (!res.ok) {
        const errorMsg = (json as { error?: string } | null)?.error || `Fehler ${res.status}`;
        const toastKind = res.status >= 500 ? 'err' : 'warn';
        toast(toastKind, errorMsg);
        return { ok: false, error: errorMsg, status: res.status };
      }

      return { ok: true, data: json as T };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) {
        toast('warn', 'Verbindung verloren, versuche erneut...');
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  }

  const msg = lastErr?.message ?? 'Netzwerkfehler';
  toast('err', msg);
  return { ok: false, error: msg, status: 0 };
}
