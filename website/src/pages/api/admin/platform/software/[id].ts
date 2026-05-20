import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { deleteSoftwareAsset, upsertSoftwareAsset } from '../../../../../lib/platform-db';

export const prerender = false;

export const PUT: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const asset = await request.json();
    // Ensure ID matches
    if (asset.id !== params.id) {
      return new Response(JSON.stringify({ error: 'ID mismatch' }), { status: 400 });
    }
    const result = await upsertSoftwareAsset(asset);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
    await deleteSoftwareAsset(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
