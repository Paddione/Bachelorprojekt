import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { isIngestedSource, slugForSource, candidateHrefs, labelForSource } from '../../../../lib/brain-links';

const BRAIN_BASE_URL =
  process.env.BRAIN_INTERNAL_URL ?? 'http://brain.workspace.svc.cluster.local';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

interface BrainLink {
  href: string;
  label: string;
}

interface BrainResponse {
  links: BrainLink[];
  uncovered: string[];
  missing: string[];
  fetchedAt: string;
  error?: string;
}

async function headProbe(base: string, href: string): Promise<boolean> {
  const res = await fetch(`${base}${href}`, {
    method: 'HEAD',
    signal: AbortSignal.timeout(3000),
  });
  return res.status === 200;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get('paths');
  if (!raw) return json({ error: 'paths parameter required' }, 400);

  const paths = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const links: BrainLink[] = [];
  const uncovered: string[] = [];
  const missing: string[] = [];
  const fetchedAt = new Date().toISOString();

  // Netzfehler (DNS, Timeout) schlagen erst beim ersten echten Probe-Aufruf an;
  // ein vollstaendig leeres paths-Array hat kein Netz, deshalb hier schon belegt.
  if (paths.length === 0) {
    return json({ links: [], uncovered: [], missing: [], fetchedAt });
  }

  let serviceError: string | undefined;
  try {
    for (const path of paths) {
      if (!isIngestedSource(path)) {
        uncovered.push(path);
        continue;
      }
      const slug = slugForSource(path);
      const label = labelForSource(path);
      const hrefs = candidateHrefs(slug);
      let matched = false;
      for (const href of hrefs) {
        if (await headProbe(BRAIN_BASE_URL, href)) {
          links.push({ href, label });
          matched = true;
          break;
        }
      }
      if (!matched) missing.push(slug);
    }
  } catch (err) {
    serviceError = err instanceof Error ? err.message : String(err);
  }

  const body: BrainResponse = { links, uncovered, missing, fetchedAt };
  if (serviceError) body.error = serviceError;
  return json(body);
};
