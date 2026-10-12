import type { APIRoute } from 'astro';
import { getLiveRepoHealthGoals } from '../../../lib/sdlc/goals-data-db';

export const prerender = false;

const json = (body: unknown, status: number = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });

export const GET: APIRoute = async () => {
  try {
    const { goals, source } = await getLiveRepoHealthGoals();
    return json({
      goals,
      source,
      count: goals.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : 'Fehler beim Laden der Health-Goals',
      },
      500
    );
  }
};
