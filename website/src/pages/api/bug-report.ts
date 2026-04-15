import type { APIRoute } from 'astro';
import { insertBugTicket } from '../../lib/website-db';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BRAND = process.env.BRAND || 'mentolder';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORY_LABELS: Record<string, string> = {
  fehler: 'Fehler',
  verbesserung: 'Verbesserung',
  erweiterungswunsch: 'Erweiterungswunsch',
};

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

function generateTicketId(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `BR-${today}-${rand}`;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    const description = (formData.get('description')?.toString() ?? '').replace(/\r/g, '').trim();
    const email = (formData.get('email')?.toString() ?? '').trim().slice(0, 200);
    const category = (formData.get('category')?.toString() ?? '').trim();
    const url = (formData.get('url')?.toString() ?? 'unbekannt').slice(0, 500).replace(/[\r\n]/g, ' ');

    if (!description) {
      return jsonError('Bitte beschreiben Sie das Problem.', 400);
    }
    if (description.length > 2000) {
      return jsonError('Beschreibung zu lang (max. 2000 Zeichen).', 400);
    }
    if (!email || !EMAIL_RE.test(email)) {
      return jsonError('Bitte geben Sie eine gültige E-Mail-Adresse an.', 400);
    }
    if (!category || !(category in CATEGORY_LABELS)) {
      return jsonError('Bitte wählen Sie eine Kategorie.', 400);
    }

    // Validate screenshots (accepted but not stored yet)
    const screenshots = formData.getAll('screenshot');
    for (const item of screenshots) {
      if (!(item instanceof File) || item.size === 0) continue;
      if (item.size > MAX_BYTES) {
        return jsonError(`Datei "${item.name}" zu groß (max. 5 MB).`, 400);
      }
      if (!ALLOWED_MIME.has(item.type)) {
        return jsonError(`"${item.name}": Dateiformat nicht unterstützt. Erlaubt: PNG, JPEG, WEBP.`, 400);
      }
    }
    if (screenshots.filter(s => s instanceof File && s.size > 0).length > 3) {
      return jsonError('Maximal 3 Screenshots erlaubt.', 400);
    }

    const ticketId = generateTicketId();

    await insertBugTicket({
      ticketId,
      category,
      reporterEmail: email,
      description,
      url,
      brand: BRAND,
    });

    return new Response(
      JSON.stringify({ success: true, ticketId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Bug report error:', err);
    return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
  }
};
