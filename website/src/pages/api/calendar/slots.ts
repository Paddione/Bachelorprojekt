import type { APIRoute } from 'astro';
import { getAvailableSlots } from '../../../lib/caldav';

// Returns available booking slots as JSON.
// Optional query param: ?from=2026-04-07 (defaults to today)
export const GET: APIRoute = async ({ url }) => {
  try {
    const fromParam = url.searchParams.get('from');
    const fromDate = fromParam ? new Date(fromParam) : undefined;

    const slots = await getAvailableSlots(fromDate);

    return new Response(JSON.stringify(slots), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 min
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
