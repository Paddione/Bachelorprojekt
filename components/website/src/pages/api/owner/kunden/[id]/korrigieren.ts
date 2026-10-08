import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import { listInboxItems } from '../../../../../lib/messaging-db';
import { deriveClients, normalizeClientEmail } from '../../../../../lib/clients';

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

const EMAIL_RE = /.+@.+\..+/;
const PHONE_RE = /^[0-9 +\-/()]*$/;

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
  const id = decodeId(params.id ?? '');
  if (!id.startsWith('mail:')) {
    return json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
  }

  try {
    const clients = deriveClients(await listInboxItems({ brand, type: 'booking' }));
    const client = clients.find((entry) => entry.id === id) ?? null;
    if (client === null) {
      return json({ error: 'Kunde nicht gefunden.' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      return json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' }, { status: 400 });
    }
    const allowed = new Set(['name', 'email', 'phone']);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        return json({ error: `Unbekanntes Feld: ${key}.` }, { status: 400 });
      }
    }
    const patch: { name?: string; email?: string; phone?: string | null } = {};
    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '') {
        return json({ error: 'Name darf nicht leer sein.' }, { status: 400 });
      }
      if (name.length > 200) {
        return json({ error: 'Name maximal 200 Zeichen.' }, { status: 400 });
      }
      patch.name = name;
    }
    if ('email' in body) {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (email === '' || email.length > 254 || !EMAIL_RE.test(email)) {
        return json({ error: 'E-Mail-Adresse ist ungültig.' }, { status: 400 });
      }
      const normalized = normalizeClientEmail(email);
      if (normalized === null) {
        return json({ error: 'E-Mail-Adresse ist ungültig.' }, { status: 400 });
      }
      patch.email = normalized;
    }
    if ('phone' in body) {
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (phone.length > 50 || !PHONE_RE.test(phone)) {
        return json({ error: 'Telefonnummer ist ungültig.' }, { status: 400 });
      }
      patch.phone = phone === '' ? null : phone;
    }
    if (Object.keys(patch).length === 0) {
      return json({ error: 'Keine Änderung übermittelt.' }, { status: 400 });
    }

    if (patch.email !== undefined && patch.email !== client.email) {
      const taken = clients.some(
        (entry) => entry.id !== client.id && entry.email === patch.email,
      );
      if (taken) {
        return json({ error: 'Diese E-Mail-Adresse ist bereits einem anderen Kunden zugeordnet.' }, { status: 409 });
      }
    }

    // Derived model: the correction rewrites the payload on the customer's
    // inbox rows, brand-scoped. A changed email moves the rows to the new
    // derived id; history follows the rows.
    await pool.query(
      `UPDATE inbox_items SET payload = payload || $1::jsonb
       WHERE id = ANY($2::int[]) AND brand = $3 AND type = 'booking'`,
      [JSON.stringify(patch), client.requestIds, brand],
    );
    return json({ success: true }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/kunden/korrigieren]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
