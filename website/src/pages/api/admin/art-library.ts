import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSession, isAdmin } from '../../../lib/auth';

const BRAND = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
const MANIFEST_PATH = resolve(process.cwd(), '..', 'art-library', 'sets', BRAND, 'manifest.json');

function toPublicUrl(flat: string): string {
  const m = flat.match(/^([a-z]+)_(.+)$/);
  if (!m) return `/brand/${BRAND}/${flat}`;
  return `/brand/${BRAND}/${m[1]}/${m[2]}`;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    // Asset shape from manifest.json: arbitrary metadata plus a `files` map of slot -> relative path.
    interface ArtLibraryAsset {
      files?: Record<string, unknown>;
      [key: string]: unknown;
    }
    const assets = (manifest.assets ?? []).map((a: ArtLibraryAsset) => ({
      ...a,
      files: Object.fromEntries(
        Object.entries(a.files ?? {}).map(([slot, rel]) => [slot, toPublicUrl(String(rel))]),
      ),
    }));
    return new Response(
      JSON.stringify({ brand: manifest.brand ?? BRAND, tokens: manifest.tokens ?? {}, assets }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(JSON.stringify({ brand: BRAND, tokens: {}, assets: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
