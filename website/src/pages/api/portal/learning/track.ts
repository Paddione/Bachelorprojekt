import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { upsertLearningItem } from '../../../../lib/learning-db';
import { goals, tools } from '../../../../lib/agentGuide';

const goalIds = new Set(goals.map(g => g.id));
const toolIds = new Set(tools.map(t => t.id));

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { item_type, item_id, status, note } = body as Record<string, unknown>;

  if (item_type !== 'goal' && item_type !== 'tool') {
    return new Response(JSON.stringify({ error: 'item_type must be "goal" or "tool"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validIds = item_type === 'goal' ? goalIds : toolIds;
  if (typeof item_id !== 'string' || !validIds.has(item_id)) {
    return new Response(JSON.stringify({ error: `item_id "${item_id}" is not a valid ${item_type} id` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (status !== undefined && status !== 'todo' && status !== 'in_progress' && status !== 'done') {
    return new Response(JSON.stringify({ error: 'status must be "todo", "in_progress", or "done"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const row = await upsertLearningItem(
      session.sub,
      session.brand ?? 'mentolder',
      item_type,
      item_id,
      {
        status: status as 'todo' | 'in_progress' | 'done' | undefined,
        note: typeof note === 'string' ? note : undefined,
      }
    );
    return new Response(JSON.stringify(row), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
