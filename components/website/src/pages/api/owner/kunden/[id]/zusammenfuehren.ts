import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import { listInboxItems } from '../../../../../lib/messaging-db';
import { deriveClients } from '../../../../../lib/clients';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

/** Reads a JSON or HTML-form body into a plain object. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>;
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function json(body: Record<string, unknown>, init: { status: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function decodeId(raw: string): string {
  try {
    return raw.includes('%') ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const brand = ownerBusiness(session).brand ?? BRAND_FALLBACK;
  const keepId = decodeId(params.id ?? '');
  if (!keepId.startsWith('mail:')) {
    return json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' }, { status: 400 });
  }
  // Never silent: the request must carry both entry ids plus an explicit
  // confirmation. Forms send strings, JSON sends booleans — accept both.
  const dropId = typeof body.dropId === 'string' ? body.dropId : null;
  const confirm = body.confirm === true || body.confirm === 'true';
  if (dropId === null || dropId === '' || !confirm) {
    return json({ error: 'Zusammenführung erfordert beide Eintrags-IDs und bestätigtes confirm.' }, { status: 400 });
  }
  if (dropId === keepId) {
    return json({ error: 'Beide Einträge müssen verschieden sein.' }, { status: 400 });
  }

  try {
    const rows = await listInboxItems({ brand, type: 'booking' });
    const clients = deriveClients(rows);
    const keep = clients.find((entry) => entry.id === keepId) ?? null;
    const drop = clients.find((entry) => entry.id === dropId) ?? null;
    if (keep === null) {
      return json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
    }
    if (drop === null) {
      // Already merged sources answer 409, unknown ids answer 404.
      const dropEmail = dropId.startsWith('mail:') ? dropId.slice('mail:'.length) : null;
      const alreadyMerged = dropEmail !== null && rows.some(
        (row) => (row.payload as Record<string, unknown>).mergedFrom === dropEmail,
      );
      if (alreadyMerged) {
        return json({ error: 'Dieser Eintrag wurde bereits zusammengeführt.' }, { status: 409 });
      }
      return json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
    }

    // Merge: the dropped rows adopt the kept contact data (the kept entry
    // wins), each stamped with its origin id. History unites
    // chronologically through the shared grouping key.
    const mergedAt = new Date().toISOString();
    await pool.query(
      `UPDATE inbox_items SET payload = payload || $1::jsonb
       WHERE id = ANY($2::int[]) AND brand = $3 AND type = 'booking'`,
      [
        JSON.stringify({
          name: keep.name,
          email: keep.email,
          phone: keep.phone,
          mergedFrom: drop.email,
          mergedInto: keep.email,
          mergedAt,
        }),
        drop.requestIds,
        brand,
      ],
    );
    return json({
      success: true,
      kept: keepId,
      merged: dropId,
      historyCount: keep.requestCount + drop.requestCount,
    }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/kunden/zusammenfuehren]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
