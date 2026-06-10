import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { writeControl } from '../../../lib/factory-floor';

export const prerender = false;

interface ControlState {
  killSwitch: boolean;
  dryRun: boolean;
  slotCap: number;
  dailyCap: number;
  updatedAt: string | null;
}

async function readControl(key: string, fallback: string): Promise<{ value: string; updated_at: string | null }> {
  const r = await pool.query(
    `SELECT value, updated_at FROM tickets.factory_control WHERE key = $1 AND brand IS NULL LIMIT 1`,
    [key],
  );
  return {
    value: r.rows[0]?.value ?? fallback,
    updated_at: r.rows[0]?.updated_at ? new Date(r.rows[0].updated_at).toISOString() : null,
  };
}

async function getControlState(): Promise<ControlState> {
  const [kill, dry, slotCapEnv, daily, dailyCapRow] = await Promise.all([
    readControl('killswitch', 'off'),
    readControl('dry-run', 'off'),
    Promise.resolve(process.env.FACTORY_GLOBAL_CAP ?? '4'),
    readControl('daily-cap', '20'),
    readControl('killswitch', 'off'),
  ]);

  const latestUpdate = [kill.updated_at, dry.updated_at, daily.updated_at]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    killSwitch: kill.value === 'on',
    dryRun: dry.value === 'on',
    slotCap: parseInt(slotCapEnv, 10) || 4,
    dailyCap: parseInt(daily.value, 10) || 20,
    updatedAt: latestUpdate,
  };
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  try {
    const state = await getControlState();
    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/factory-control] GET error:', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allowed: Record<string, (v: unknown) => string | null> = {
    killSwitch: (v) => typeof v === 'boolean' ? (v ? 'on' : 'off') : null,
    dryRun: (v) => typeof v === 'boolean' ? (v ? 'on' : 'off') : null,
    dailyCap: (v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (isNaN(n) || n < 1 || n > 50) return null;
      return String(n);
    },
    slotCap: (v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (isNaN(n) || n < 1 || n > 8) return null;
      return String(n);
    },
  };

  try {
    for (const [field, parse] of Object.entries(allowed)) {
      if (field in body) {
        const mapped = parse(body[field]);
        if (mapped === null) {
          return new Response(JSON.stringify({ error: `invalid_value`, field }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const dbKey = field === 'killSwitch' ? 'killswitch'
          : field === 'dryRun' ? 'dry-run'
          : field === 'dailyCap' ? 'daily-cap'
          : 'slot-cap';
        await writeControl(dbKey, mapped, session!.preferred_username);
      }
    }
    const state = await getControlState();
    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/factory-control] PATCH error:', err);
    return new Response(JSON.stringify({ error: 'update_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
