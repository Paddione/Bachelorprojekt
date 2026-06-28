import https from 'node:https';
import fs from 'node:fs/promises';

/** Error carrying the HTTP status so callers can distinguish 403 (no-access)
 *  from 404 (missing) instead of collapsing both into a generic failure. */
export class K8sApiError extends Error {
  readonly status: number;
  constructor(status: number, statusMessage: string | undefined, body: string) {
    super(`K8s API ${status}: ${statusMessage ?? ''} — ${body}`);
    this.name = 'K8sApiError';
    this.status = status;
  }
}

export type K8sClient = {
  get: <T = unknown>(path: string) => Promise<T>;
  patch: <T = unknown>(path: string, body: object) => Promise<T>;
  mergePatch: <T = unknown>(path: string, body: object) => Promise<T>;
  post: <T = unknown>(path: string, body: object) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
};

export async function createK8sClient(): Promise<K8sClient> {
  const token = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
  const ca = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');

  function request<T = unknown>(path: string, method: string, body?: object, contentType = 'application/strategic-merge-patch+json'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const req = https.request(
        {
          hostname: 'kubernetes.default.svc.cluster.local',
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(bodyStr && {
              'Content-Type': contentType,
              'Content-Length': Buffer.byteLength(bodyStr),
            }),
          },
          ca,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new K8sApiError(res.statusCode, res.statusMessage, data));
            } else {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            }
          });
        }
      );
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  return {
    get: <T = unknown>(path: string) => request<T>(path, 'GET'),
    patch: <T = unknown>(path: string, body: object) => request<T>(path, 'PATCH', body),
    mergePatch: <T = unknown>(path: string, body: object) => request<T>(path, 'PATCH', body, 'application/merge-patch+json'),
    post: <T = unknown>(path: string, body: object) => request<T>(path, 'POST', body, 'application/json'),
    delete: <T = unknown>(path: string) => request<T>(path, 'DELETE'),
  };
}

/** Read SA token + CA for raw streaming use (logs SSE endpoint). */
export async function readK8sCredentials(): Promise<{ token: string; ca: string }> {
  const [token, ca] = await Promise.all([
    fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8'),
    fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8'),
  ]);
  return { token, ca };
}
