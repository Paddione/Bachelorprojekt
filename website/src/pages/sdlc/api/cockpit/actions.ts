import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import {
  setFeatureAction, batchMutate, updatePlanningRanks, reparentTicket,
  BrandMismatchError, CycleError, NotFoundError,
} from '../../../../lib/sdlc/tickets/cockpit-db';
import { writeControl } from '../../../../lib/sdlc/factory-floor';
import type { BatchMutation } from '../../../../lib/tickets/cockpit-types.ts';
// Shell commands for irreversible / CLI-backed actions
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// ---- Audit helper ----
// Every write MUST leave a record in tickets.cockpit_audit (spec D5).
// Uses the general pool (no transaction) — best-effort, never throws.
async function writeAudit(actor: string, action: string, target: string, outcome: 'success' | 'failure', detail?: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tickets.cockpit_audit (actor, action, target, outcome, brand, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor, action, target, outcome, BRAND(), detail != null ? JSON.stringify(detail) : null],
    );
  } catch { /* best-effort */ }
}

// ---- Action dispatcher ----
// Maps action names to their implementation. Returns { status, body } so the
// caller can wrap the response in a uniform JSON envelope and attach the audit
// line. Throws on unexpected errors — caught by the main handler.
async function runAction(
  action: string,
  target: string | undefined,
  body: Record<string, unknown>,
  actor: string,
): Promise<{ status: number; body: unknown }> {
  const brand = BRAND();

  switch (action) {
    // ---- Cockpit ticket/feature endpoints (reversible) ----
    case 'feature_action': {
      // The top-level JSON 'action' field is the routing key (feature_action).
      // The inner action type (next_step/discard/major/comment) comes as
      // 'featAction' to avoid clashing with the routing key.
      const { featureId, featAction, value } = body;
      if (!featureId || !featAction) return { status: 400, body: { error: 'featureId and featAction required' } };
      return { status: 200, body: await setFeatureAction(brand, String(featureId), String(featAction), value as boolean | string | undefined) };
    }
    case 'feature_actions': {
      const { actions } = body as { actions?: { featureId: string; action: string; value?: boolean | string }[] };
      if (!Array.isArray(actions) || actions.length === 0) return { status: 400, body: { error: 'actions array required' } };
      const results: { featureId: string; success: boolean; error?: string }[] = [];
      for (const entry of actions) {
        try {
          await setFeatureAction(brand, entry.featureId, entry.action, entry.value);
          results.push({ featureId: entry.featureId, success: true });
        } catch (e) {
          if (e instanceof BrandMismatchError) {
            results.push({ featureId: entry.featureId, success: false, error: 'cross-brand' });
          } else {
            throw e;
          }
        }
      }
      return { status: 200, body: { ok: true, results } };
    }
    case 'batch': {
      const { ticketIds, mutation } = body as { ticketIds?: string[]; mutation?: BatchMutation };
      if (!Array.isArray(ticketIds) || ticketIds.length === 0) return { status: 400, body: { error: 'ticketIds required' } };
      if (ticketIds.length > 100) return { status: 400, body: { error: 'too many' } };
      if (!mutation || Object.keys(mutation).length === 0) return { status: 400, body: { error: 'mutation required' } };
      return { status: 200, body: await batchMutate(brand, ticketIds, mutation) };
    }
    case 'reorder': {
      const { updates } = body as { updates?: { ticketId: string; planningRank: number }[] };
      if (!Array.isArray(updates) || updates.length === 0) return { status: 400, body: { error: 'updates required' } };
      if (updates.length > 100) return { status: 400, body: { error: 'too many updates' } };
      await updatePlanningRanks(brand, updates);
      return { status: 200, body: { ok: true, updated: updates.length } };
    }
    case 'reparent': {
      const { ticketId, newParentId } = body as { ticketId?: string; newParentId?: string | null };
      if (!ticketId) return { status: 400, body: { error: 'ticketId required' } };
      await reparentTicket(brand, String(ticketId), newParentId ?? null);
      return { status: 200, body: { ok: true, ticketId, newParentId } };
    }
    case 'suggest': {
      // --- suggest is LLM-backed and heavyweight; delegate to its dedicated
      //     handler by importing and calling the same logic inline. ---
      const { getPortfolio } = await import('../../../../lib/sdlc/tickets/cockpit-db');
      const { buildFeatureList, parseSuggestions, SUGGEST_SYSTEM_PROMPT } = await import('../../../../lib/tickets/suggest-prompt');
      const OpenAI = (await import('openai')).default;
      const providerId = String(body.provider || 'deepseek');
      const model = String(body.model || (providerId === 'deepseek' ? 'deepseek-chat' : 'claude-sonnet-4-20250514'));
      const apiKeyEnv = providerId === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'ANTHROPIC_API_KEY';
      const baseURL = providerId === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.anthropic.com/v1';
      const apiKey = process.env[apiKeyEnv] ?? '';
      if (!apiKey) return { status: 503, body: { error: `provider not configured: ${providerId}` } };
      const port = await getPortfolio(brand);
      const featureList = buildFeatureList(port);
      if (featureList === '') return { status: 200, body: { suggestions: [] } };
      const client = new OpenAI({ apiKey, baseURL });
      const resp = await client.chat.completions.create({
        model,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
          { role: 'user', content: `Hier sind die Features:\n\n${featureList}` },
        ],
      }, { timeout: 10_000 });
      const text = resp.choices[0]?.message.content ?? '';
      return { status: 200, body: { suggestions: parseSuggestions(text) } };
    }

    // ---- Factory control (repeatable / reversible) ----
    case 'factory_tick': {
      const requestedAt = new Date().toISOString();
      await writeControl('force-tick-requested', requestedAt, actor);
      return { status: 200, body: { ok: true, action: 'tick', requestedAt } };
    }
    case 'factory_enqueue': {
      const ticketId = target || String(body.ticketId || '');
      if (!ticketId) return { status: 400, body: { error: 'ticketId required for enqueue' } };
      const requestedAt = new Date().toISOString();
      await writeControl('enqueue-requested', JSON.stringify({ ticketId, at: requestedAt }), actor);
      return { status: 200, body: { ok: true, action: 'enqueue', ticketId, requestedAt } };
    }
    case 'factory_release_slot': {
      const slotId = target || String(body.slotId || '');
      if (!slotId) return { status: 400, body: { error: 'slotId required for release' } };
      const requestedAt = new Date().toISOString();
      await writeControl('release-slot-requested', JSON.stringify({ slotId, at: requestedAt }), actor);
      return { status: 200, body: { ok: true, action: 'release_slot', slotId, requestedAt } };
    }

    // ---- Deploy / CI (irreversible — shell exec) ----
    case 'flux_reconcile': {
      // Fleet cluster: reconcile the brand Kustomization with source sync.
      // flux reconcile kustomization <name> [--with-source] [--context <ctx>]
      const ksName = target || 'flux-website-mentolder';
      const cmd = `flux reconcile kustomization ${ksName} --with-source --context fleet`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000 });
      return { status: 200, body: { ok: true, action: 'flux_reconcile', stdout, stderr } };
    }
    case 'ci_rerun': {
      const runId = target || String(body.runId || '');
      if (!runId) return { status: 400, body: { error: 'runId required for ci_rerun' } };
      const { stdout, stderr } = await execAsync(`gh-axi run rerun ${runId} --failed`, { timeout: 15_000 });
      return { status: 200, body: { ok: true, action: 'ci_rerun', runId, stdout, stderr } };
    }

    // ---- Ticket lifecycle (scripts/ticket.sh — reversible / irreversible) ----
    case 'ticket_stage_plan': {
      const ticketId = target || String(body.ticketId || '');
      if (!ticketId) return { status: 400, body: { error: 'ticketId required' } };
      const plan = String(body.plan || '');
      const branch = String(body.branch || '');
      const planArg = plan ? `--plan "${plan}"` : '';
      const branchArg = branch ? `--branch "${branch}"` : '';
      const { stdout, stderr } = await execAsync(`bash scripts/ticket.sh stage-plan ${ticketId} ${planArg} ${branchArg}`, { timeout: 15_000 });
      return { status: 200, body: { ok: true, action: 'stage_plan', ticketId, stdout, stderr } };
    }
    case 'ticket_release_hold': {
      const ticketId = target || String(body.ticketId || '');
      if (!ticketId) return { status: 400, body: { error: 'ticketId required' } };
      const { stdout, stderr } = await execAsync(`bash scripts/ticket.sh release-hold ${ticketId}`, { timeout: 15_000 });
      return { status: 200, body: { ok: true, action: 'release_hold', ticketId, stdout, stderr } };
    }
    case 'ticket_close': {
      const ticketId = target || String(body.ticketId || '');
      if (!ticketId) return { status: 400, body: { error: 'ticketId required' } };
      const resolution = String(body.resolution || 'fixed');
      const { stdout, stderr } = await execAsync(`bash scripts/ticket.sh update-status --id ${ticketId} --status done --resolution "${resolution}"`, { timeout: 15_000 });
      return { status: 200, body: { ok: true, action: 'close', ticketId, stdout, stderr } };
    }

    default:
      return { status: 400, body: { error: `unknown action: ${action}` } };
  }
}

// ---- Route handler ----
export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: session ? 'Forbidden' : 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { action?: string; target?: string; [key: string]: unknown };
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: 'bad json' }, 400);
  }

  const { action, target, ...params } = body;
  if (!action) return json({ error: 'action required' }, 400);

  const actor = session.preferred_username ?? session.email ?? 'admin';

  try {
    const result = await runAction(action, target, params, actor);

    // Audit: success
    await writeAudit(actor, action, target ?? JSON.stringify(params), 'success', {
      status: result.status,
      ...(result.body as Record<string, unknown>),
    });

    return json(result.body, result.status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Audit: failure — must be recorded per spec requirement
    await writeAudit(actor, action, target ?? JSON.stringify(params), 'failure', {
      error: message,
    });

    // Route known errors to appropriate status codes
    if (err instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    if (err instanceof CycleError) return json({ error: 'cycle detected' }, 400);
    if (err instanceof NotFoundError) return json({ error: 'not found' }, 404);

    locals?.requestLogger?.error?.({ err }, `[actions] ${action} failed:`);
    return json({ error: message }, 500);
  }
};
