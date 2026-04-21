import type { APIRoute } from 'astro';
import { getAvailableSlots } from '../../../lib/caldav';

// Returns available booking slots as JSON.
// Optional query params: ?from=2026-04-07, ?durationMin=30
export const GET: APIRoute = async ({ url }) => {
  try {
    const fromParam = url.searchParams.get('from');
    const fromDate = fromParam ? new Date(fromParam) : undefined;
    const durationParam = url.searchParams.get('durationMin');
    const durationMin = durationParam ? parseInt(durationParam, 10) : undefined;

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
    console.error('Slots API error:', err);
    return new Response(
      JSON.stringify({ error: 'Termine konnten nicht geladen werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
