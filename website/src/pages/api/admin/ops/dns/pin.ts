import type { APIRoute } from 'astro';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../../lib/auth';

const CONFIG: Record<string, { domain: string; pinIp: string; hashEnvVar: string }> = {
  mentolder:  { domain: 'mentolder.de',  pinIp: process.env.LIVEKIT_PIN_IP_MENTOLDER  ?? '46.225.125.59', hashEnvVar: 'IPV64_UPDATE_HASH_MENTOLDER' },
  korczewski: { domain: 'korczewski.de', pinIp: process.env.LIVEKIT_PIN_IP_KORCZEWSKI ?? '37.27.251.38',  hashEnvVar: 'IPV64_UPDATE_HASH_KORCZEWSKI' },
};

function ipv64Update(hash: string, subdomain: string, ip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const path = `/update.php?key=${encodeURIComponent(hash)}&domain=${encodeURIComponent(subdomain)}&ip=${encodeURIComponent(ip)}`;
    const req = https.get({ hostname: 'ipv64.net', path, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const cfg = CONFIG[cluster];
  if (!cfg) return new Response(JSON.stringify({ error: 'Ungültiger Cluster (mentolder|korczewski)' }), { status: 400 });

  const hash = process.env[cfg.hashEnvVar] ?? '';
  if (!hash) return new Response(JSON.stringify({ error: `${cfg.hashEnvVar} nicht konfiguriert. Bitte in website-secrets setzen.` }), { status: 503 });

  const results: string[] = [];
  for (const sub of ['livekit', 'stream']) {
    const fqdn = `${sub}.${cfg.domain}`;
    const resp = await ipv64Update(hash, fqdn, cfg.pinIp);
    results.push(`${fqdn} → ${cfg.pinIp}: ${resp}`);
  }

  return new Response(JSON.stringify({ ok: true, results, pinIp: cfg.pinIp }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
