import type { Role } from '../types/state';

/**
 * The full gated set = the post-§4.1 RELAY_TYPES (optik removed, jump added)
 * PLUS `figure_lock`. This is the EXACT msgType union — NOT `string` — so
 * Default-Deny is type-driven: a msgType that is not a member is rejected at the
 * call site by the compiler, and any value reaching `canMutate` that is not
 * explicitly allowed below returns `false`.
 */
export type MutationType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot'
  | 'figure_lock'
  | 'figure_possess' | 'figure_release'
  | 'figure_note_set';  // Slice 5: Notizen pro Figur
// NB (E1/E9): `zone_update` and `figure_hide_set` are deliberately NOT MutationTypes.
// They travel the ADMIN_TYPES path (leiter-gated in ws-connection.ts →
// handleAdminMessage), never the `canMutate` relay matrix — do NOT wire them here.

export interface MutateContext {
  msgType: MutationType;
  /** Resolved ONLY from ws._session.userId via __roles__; unknown/anon → 'beobachter'. */
  role: Role;
  /** Canonical identity (resolvePlayerId). */
  playerId: string;
  /** figureMaps.get(room).get(msg.id)?.ownerId for the target figure (or null). */
  figureOwnerId?: string | null;
  /** From LobbySettings.allowRepresentativeAdd (Phase D); absent ⇒ false (fail-closed). */
  allowRepresentativeAdd?: boolean;
}

/**
 * The SOLE mutation chokepoint. Pure. FAIL-CLOSED: any path not explicitly
 * allowed returns false (Default-Deny). Called BEFORE apply/broadcast in the
 * RELAY_TYPES block AND in the figure_lock branch.
 *
 * Matrix:
 *  - request_state_snapshot → true for ALL roles (read-only, never denied).
 *  - leiter → true for everything.
 *  - stellvertreter → move/update/jump/delete/figure_lock iff figureOwnerId===playerId;
 *      add iff allowRepresentativeAdd; clear/snapshot/stiffness never.
 *  - beobachter → only request_state_snapshot (handled above); everything else false.
 *  - any other (unknown/dead) msgType → false.
 */
export function canMutate(ctx: MutateContext): boolean {
  // Read is never denied for any role.
  if (ctx.msgType === 'request_state_snapshot') return true;

  // The explicit allow-list of write types. Default-Deny applies to anything
  // outside this set — for EVERY role, including leiter (a dead/unknown type
  // like `optik` must never slip through any role).
  switch (ctx.msgType) {
    case 'add':
    case 'move':
    case 'update':
    case 'jump':
    case 'delete':
    case 'clear':
    case 'stiffness':
    case 'snapshot':
    case 'figure_lock':
    case 'figure_possess':
    case 'figure_release':
    case 'figure_note_set':
      break;
    default:
      return false; // Default-Deny for any non-matrix msgType.
  }

  if (ctx.role === 'leiter') return true;

  if (ctx.role === 'stellvertreter') {
    switch (ctx.msgType) {
      case 'move':
      case 'update':
      case 'jump':
      case 'delete':
      case 'figure_lock':
      case 'figure_note_set':
        return ctx.figureOwnerId != null && ctx.figureOwnerId === ctx.playerId;
      case 'add':
        return ctx.allowRepresentativeAdd === true;
      // clear / snapshot / stiffness (leiter-only) → deny.
      default:
        return false;
    }
  }

  // beobachter may possess a free figure (Observer → possessor transition).
  // figure_release is also permitted (own possessions only — ws-handler enforces
  // the playerId match at apply time).
  if (ctx.role === 'beobachter') {
    if (ctx.msgType === 'figure_possess' || ctx.msgType === 'figure_release') {
      return true;
    }
    return false; // read-only for everything else
  }

  if (ctx.role === 'gast') {
    return false;
  }

  // beobachter (and any unrecognized role) → read-only; request_state_snapshot
  // already returned true above, every write type falls through to deny.
  return false;
}

/**
 * Strict role resolution. Roles key ONLY on the authenticated session id
 * (`ws._session.userId`). A session-less client (anon / client-supplied
 * `_playerId` only) can NEVER bear a role above beobachter — this prevents a
 * `{type:'join', playerId:'<leiter-userId>'}` escalation.
 */
export function resolveRole(ws: any, roles: Record<string, Role>): Role {
  if (ws?._isGuest) return 'gast';
  const uid = ws?._session?.userId;
  if (!uid) return 'beobachter';
  return roles?.[uid] ?? 'beobachter';
}
