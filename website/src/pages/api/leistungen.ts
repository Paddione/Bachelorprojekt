import type { APIRoute } from 'astro';
import { getEffectiveLeistungen } from '../../lib/content';

export const GET: APIRoute = async () => {
  try {
    const cats = await getEffectiveLeistungen();
    const flat = cats.flatMap(cat =>
      cat.services.map(svc => ({ key: svc.key, name: svc.name, category: cat.title }))
    );
    return new Response(JSON.stringify(flat), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[GET /api/leistungen] error:', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
