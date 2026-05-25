import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createUser as kcCreateUser, assignUserToGroups, sendPasswordResetEmail } from '../../../../../lib/keycloak';
import { pool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { firstName, lastName, email, groupIds, sendInvite = true } = body;
  if (!firstName?.trim()) return new Response(JSON.stringify({ error: 'Eingabe ungültig: Vorname fehlt' }), { status: 400 });
  if (!lastName?.trim())  return new Response(JSON.stringify({ error: 'Eingabe ungültig: Nachname fehlt' }), { status: 400 });
  if (!EMAIL_RE.test(email ?? '')) return new Response(JSON.stringify({ error: 'Eingabe ungültig: Email-Format' }), { status: 400 });
  if (!Array.isArray(groupIds) || groupIds.length === 0) return new Response(JSON.stringify({ error: 'Eingabe ungültig: mindestens eine Gruppe wählen' }), { status: 400 });

  const username = email.split('@')[0];
  let actionId: number | null = null;
  try {
    actionId = await startAction(pool, {
      actor: session.preferred_username,
      action: 'user_create',
      target: username,
      payload: { firstName, lastName, email, groupIds, sendInvite },
    });

    const create = await kcCreateUser({ email, firstName, lastName });
    if (!create.success || !create.userId) throw new Error(create.error ?? 'createUser returned no userId');
    await assignUserToGroups(create.userId, groupIds);

    let partial = false;
    let inviteError: string | undefined;
    if (sendInvite) {
      try {
        const ok = await sendPasswordResetEmail(create.userId);
        if (!ok) { partial = true; inviteError = 'Keycloak returned false'; }
      } catch (e) {
        partial = true;
        inviteError = sanitizeForLog((e as Error).message);
      }
    }

    await finishAction(pool, actionId, {
      status: partial ? 'partial_success' : 'success',
      payload: { user_id: create.userId, partial, inviteError },
      error: partial ? `User angelegt, Einladung fehlgeschlagen: ${inviteError}` : undefined,
    });

    return new Response(JSON.stringify({ action_id: actionId, userId: create.userId, partial, inviteError }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      return new Response(JSON.stringify({ error: 'Anlage läuft bereits, bitte warten' }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) await finishAction(pool, actionId, { status: 'failed', error: msg }).catch(() => {});
    console.error('[ops/users/create]', err);
    return new Response(JSON.stringify({ error: 'Anlage fehlgeschlagen: ' + msg.slice(0, 200) }), { status: 500 });
  }
};
