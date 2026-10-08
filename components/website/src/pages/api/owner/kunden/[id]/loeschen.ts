// Regelquelle: T901019 §5-6 (docs/website/massage-privacy-requirements).
// Steuerfristen (§257 HGB, §147 AO, GoBD) gehen als Mindestaufbewahrung
// vor; wo die Löschung dadurch blockiert ist, werden Kontaktdaten
// anonymisiert statt gelöscht, Rechnungsdaten bleiben erhalten.
// Aufbewahrungsdetails sind der Steuerberatung vorbehalten
// (Recherche-Checkliste, keine Rechts- oder Steuerberatung).
import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../../../lib/owner-guard';
import { pool } from '../../../../../lib/messaging-db-pool';
import { listInboxItems } from '../../../../../lib/messaging-db';
import { deriveClients } from '../../../../../lib/clients';

const BRAND_FALLBACK = process.env.BRAND || 'mentolder';

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

    // Retention guard: a confirmed appointment may have invoice relevance,
    // so statutory retention cannot be excluded — anonymize instead of
    // deleting. Conservative heuristic; exact periods need Steuerberatung.
    const retentionBlocked = client.history.some((entry) => entry.state === 'bestaetigt');
    if (retentionBlocked) {
      const latestSlot = client.history
        .map((entry) => entry.slotStart)
        .filter((slot): slot is string => slot !== null)
        .sort()
        .at(-1);
      const base = latestSlot !== undefined ? new Date(latestSlot) : new Date();
      const retainUntil = Number.isNaN(base.getTime()) ? new Date() : base;
      retainUntil.setFullYear(retainUntil.getFullYear() + 10);
      const retainDate = retainUntil.toISOString().slice(0, 10);
      // Anonymize: contact fields become non-personal, history and service
      // references stay. email null removes the rows from the directory
      // (no usable contact path) while the inbox rows are retained.
      await pool.query(
        `UPDATE inbox_items SET payload = payload || $1::jsonb
         WHERE id = ANY($2::int[]) AND brand = $3 AND type = 'booking'`,
        [
          JSON.stringify({
            name: 'Anonymisiert (Aufbewahrungspflicht)',
            email: null,
            phone: null,
            anonymizedAt: new Date().toISOString(),
          }),
          client.requestIds,
          brand,
        ],
      );
      return json({
        success: true,
        mode: 'anonymisiert',
        hinweis: `Rechnungsdaten bleiben bis ${retainDate} gespeichert (steuerliche Aufbewahrung).`,
      }, { status: 200 });
    }

    await pool.query(
      `DELETE FROM inbox_items
       WHERE id = ANY($1::int[]) AND brand = $2 AND type = 'booking'`,
      [client.requestIds, brand],
    );
    return json({ success: true, mode: 'geloescht' }, { status: 200 });
  } catch (err) {
    locals.requestLogger.error({ err }, '[owner/kunden/loeschen]');
    return json({ error: 'Interner Serverfehler.' }, { status: 500 });
  }
};
