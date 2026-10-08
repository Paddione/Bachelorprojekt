import type { APIRoute } from 'astro';
import { getAvailableSlots } from '../../../lib/caldav';
import { berlinDayKey, berlinWallMinutes } from '../../../lib/caldav-cache';

/** Parses `?from=` as a Berlin calendar day (YYYY-MM-DD at Berlin midnight). */
function parseBerlinDayStart(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const dayKey = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    return undefined;
  }
  // Berlin midnight: Europe/Berlin transitions never fall on midnight, so one
  // measured-offset step back from UTC midnight lands exactly on it.
  const start = new Date(probe.getTime() - berlinWallMinutes(probe) * 60000);
  return berlinDayKey(start) === dayKey ? start : undefined;
}

// Returns available booking slots as JSON.
// Optional query params: ?from=2026-04-07, ?durationMin=30
export const GET: APIRoute = async ({ url , locals }) => {
  try {
    const fromDate = parseBerlinDayStart(url.searchParams.get('from'));
    const durationParam = url.searchParams.get('durationMin');
    const durationMin = durationParam && /^\d+$/.test(durationParam) && parseInt(durationParam, 10) > 0
      ? parseInt(durationParam, 10)
      : undefined;

    const brand = process.env.BRAND_NAME || 'mentolder';
    const slots = await getAvailableSlots(fromDate, brand, durationMin);

    return new Response(JSON.stringify(slots), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60', // Cache for 1 min
      },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, 'Slots API error:');
    return new Response(
      JSON.stringify({ error: 'Termine konnten nicht geladen werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
