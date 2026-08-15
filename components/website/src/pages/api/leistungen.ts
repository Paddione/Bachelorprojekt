import type { APIRoute } from 'astro';
import { getEffectiveLeistungen } from '../../lib/content';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const cats = await getEffectiveLeistungen();
    const flat = cats.flatMap(cat =>
      cat.services.map(svc => ({
        key: svc.key,
        name: svc.name,
        category: cat.title,
        durationMin: svc.durationMin ?? null,
      }))
    );
    return new Response(JSON.stringify(flat), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[GET /api/leistungen] error:');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
