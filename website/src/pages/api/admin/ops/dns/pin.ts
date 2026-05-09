import type { APIRoute } from 'astro';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../../lib/auth';

const CONFIG: Record<string, { domain: string; pinIp: string }> = {
  mentolder:  { domain: 'mentolder.de',  pinIp: process.env.LIVEKIT_PIN_IP_MENTOLDER  ?? '46.225.125.59' },
  korczewski: { domain: 'korczewski.de', pinIp: process.env.LIVEKIT_PIN_IP_KORCZEWSKI ?? '37.27.251.38' },
};

function ipv64Get(path: string, apiKey?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'ipv64.net',
      path,
      timeout: 10000,
      ...(apiKey && { headers: { Authorization: `Bearer ${apiKey}` } }),
    };
    const req = https.get(opts, (res) => {
      let body = '';
      res.on('data', (c: string) => { body += c; });
      res.on('end', () => resolve(body.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchDomainUpdateHash(apiKey: string, domain: string): Promise<string | null> {
  const raw = await ipv64Get('/api.php?get_domains', apiKey);
  const data = JSON.parse(raw);
  // ipv64 returns { subdomains: { "domain.de": { domain_update_hash, ... } } }
  const subdomains: Record<string, any> = data.subdomains ?? data.domains ?? {};
  const entry = subdomains[domain] ?? Object.values(subdomains).find((v: any) => v?.domain === domain);
  return entry?.domain_update_hash ?? null;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const apiKey = process.env.IPV64_API_KEY ?? '';
  if (!apiKey) return new Response(JSON.stringify({ error: 'IPV64_API_KEY nicht konfiguriert.' }), { status: 503 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const cfg = CONFIG[cluster];
  if (!cfg) return new Response(JSON.stringify({ error: 'Ungültiger Cluster (mentolder|korczewski)' }), { status: 400 });

  let hash: string | null;
  try {
    hash = await fetchDomainUpdateHash(apiKey, cfg.domain);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: `ipv64 API Fehler: ${e.message}` }), { status: 502 });
  }

  if (!hash) {
    return new Response(JSON.stringify({ error: `Keine domain_update_hash für ${cfg.domain} gefunden. Domain im ipv64-Account vorhanden?` }), { status: 404 });
  }

  const results: string[] = [];
  for (const sub of ['livekit', 'stream']) {
    const fqdn = `${sub}.${cfg.domain}`;
    const resp = await ipv64Get(`/update.php?key=${encodeURIComponent(hash)}&domain=${encodeURIComponent(fqdn)}&ip=${encodeURIComponent(cfg.pinIp)}`);
    results.push(`${fqdn} → ${cfg.pinIp}: ${resp}`);
  }

  return new Response(JSON.stringify({ ok: true, results, pinIp: cfg.pinIp }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
