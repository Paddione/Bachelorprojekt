import { randomBytes } from 'node:crypto';
import { writeFileSync, appendFileSync } from 'node:fs';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeTokenFile(path: string, token: string): void {
  writeFileSync(path, token, { mode: 0o600 });
}

export function auditMiddleware(token: string) {
  return async (c: any, next: any) => {
    if (c.req.method === 'GET') return next();
    
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${token}`) {
      return c.json({ error: 'Token required for write actions' }, 401);
    }
    
    // Audit log
    appendFileSync(
      '.lavish/kit/daemon/audit.jsonl',
      JSON.stringify({
        ts: new Date().toISOString(),
        action: c.req.url,
        method: c.req.method,
        ip: '127.0.0.1',
      }) + '\n'
    );
    
    return next();
  };
}
