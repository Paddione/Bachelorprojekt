import https from 'node:https';
import fs from 'node:fs/promises';

export type K8sClient = {
  get: (path: string) => Promise<any>;
  patch: (path: string, body: object) => Promise<any>;
  mergePatch: (path: string, body: object) => Promise<any>;
  post: (path: string, body: object) => Promise<any>;
  delete: (path: string) => Promise<any>;
};

export async function createK8sClient(): Promise<K8sClient> {
  const token = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
  const ca = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');

  function request(path: string, method: string, body?: object, contentType = 'application/strategic-merge-patch+json'): Promise<any> {
    return new Promise((resolve, reject) => {
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
              reject(new Error(`K8s API ${res.statusCode}: ${res.statusMessage} — ${data}`));
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
    get: (path) => request(path, 'GET'),
    patch: (path, body) => request(path, 'PATCH', body),
    mergePatch: (path, body) => request(path, 'PATCH', body, 'application/merge-patch+json'),
    post: (path, body) => request(path, 'POST', body, 'application/json'),
    delete: (path) => request(path, 'DELETE'),
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
