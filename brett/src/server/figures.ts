export const figureMaps = new Map<string, Map<string, any>>();
export const figureLocks = new Map<string, Map<string, { userId: string; name: string; color: string }>>();

type ValidateAppearance = (a: any) => string | null;
let validateAppearance: ValidateAppearance = () => null;

export function initFigures(deps: { validateAppearance: ValidateAppearance }): void {
  validateAppearance = deps.validateAppearance;
}

export function ensureFigureMap(room: string): Map<string, any> {
  let m = figureMaps.get(room);
  if (!m) { m = new Map(); figureMaps.set(room, m); }
  return m;
}

export function applyMutation(room: string, msg: any): void {
  const figs = ensureFigureMap(room);
  switch (msg.type) {
    case 'add': {
      const figData = msg.figure ?? msg.fig;
      if (figData && typeof figData.id === 'string' && figs.size < 200) {
        // ownerId is SERVER-AUTHORITATIVE — strip any client-supplied value, exactly
        // like `id`. Ownership is set only via the `figure_owner_set` mutation.
        const { ownerId: _stripOwner, ...safeFigData } = figData;
        const newFig = { ...safeFigData };
        if (!newFig.appearance) {
          newFig.appearance = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };
        }
        figs.set(newFig.id, newFig);
      }
      break;
    }
    case 'move':
      if (figs.has(msg.id)) {
        const f = figs.get(msg.id);
        figs.set(msg.id, { ...f, x: msg.x, z: msg.z });
      }
      break;
    case 'update':
      if (figs.has(msg.id) && msg.changes && typeof msg.changes === 'object' && !Array.isArray(msg.changes)) {
        const existing = figs.get(msg.id);
        // Strip both `id` and `ownerId` — ownerId is server-authoritative (§5c).
        const { id: _ignoredId, ownerId: _ignoredOwner, ...safeChanges } = msg.changes;
        if (safeChanges.appearance && existing.appearance && typeof existing.appearance === 'object') {
          safeChanges.appearance = {
            ...existing.appearance,
            ...safeChanges.appearance,
            accessories: {
              ...(existing.appearance.accessories || {}),
              ...(safeChanges.appearance.accessories || {}),
            },
          };
        }
        figs.set(msg.id, { ...existing, ...safeChanges });
      }
      break;
    case 'delete':
      figs.delete(msg.id);
      break;
    case 'figure_owner_set': {
      // The ONLY mutation that writes Figure.ownerId (server-authoritative).
      // Tolerates null (unassign) and a missing target (no-op, no phantom figure).
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        figs.set(msg.figureId, { ...figs.get(msg.figureId), ownerId: msg.ownerId ?? null });
      }
      break;
    }
    case 'clear':
      figs.clear();
      break;
    case 'optik_set':
      // Board-optik (§4.1). Written by the privileged admin_set_optik handler —
      // never via the relay path (`optik` is NOT in RELAY_TYPES / MutationType).
      if (msg.settings && typeof msg.settings === 'object' && !Array.isArray(msg.settings)) {
        figs.set('__optik__', { id: '__optik__', settings: msg.settings });
      }
      break;
    case 'stiffness':
      if (typeof msg.value === 'number') {
        figs.set('__stiffness__', { id: '__stiffness__', value: msg.value });
      }
      break;
    case 'session_phase_set': {
      figs.set('__session_phase__', { id: '__session_phase__', phase: msg.phase });
      break;
    }
    case 'session_code_set': {
      figs.set('__session_code__', { id: '__session_code__', code: msg.code });
      break;
    }
    case 'session_admin_token_set': {
      figs.set('__admin_token_holder__', { id: '__admin_token_holder__', playerId: msg.playerId });
      break;
    }
    case 'session_created_at_set': {
      figs.set('__session_created_at__', { id: '__session_created_at__', ts: msg.ts });
      break;
    }
    case 'session_last_activity_set': {
      figs.set('__session_last_activity__', { id: '__session_last_activity__', ts: msg.ts });
      break;
    }
    case 'coaching_steps_set': {
      if (Array.isArray(msg.steps) && msg.steps.length &&
          msg.steps.every((s: any) => typeof s === 'string' && s.length)) {
        const idx = Math.max(0, Math.min((msg.index | 0), msg.steps.length - 1));
        figs.set('__coaching_steps__', { id: '__coaching_steps__', steps: msg.steps.slice(), index: idx });
      }
      break;
    }
    case 'roles_set': {
      if (msg.roles && typeof msg.roles === 'object' && !Array.isArray(msg.roles)) {
        figs.set('__roles__', { id: '__roles__', roles: msg.roles });
      }
      break;
    }
    case 'lobby_settings_set': {
      // D3: shallow-MERGE into the existing settings so setting one field never
      // clobbers the others. Non-object payloads are ignored (no clobber).
      if (msg.settings && typeof msg.settings === 'object' && !Array.isArray(msg.settings)) {
        const prev = figs.get('__lobby_settings__')?.settings ?? {};
        figs.set('__lobby_settings__', { id: '__lobby_settings__', settings: { ...prev, ...msg.settings } });
      }
      break;
    }
  }
}

/**
 * Re-seed a figureMap from a persisted (buildStateFromMutations-shaped) state.
 * Pure: writes only into `map`. Reads the field names that
 * `buildStateFromMutations` EMITS (§4.6): `state.sessionPhase` /
 * `state.sessionCreatedAt` / `state.sessionLastActivity` — NOT
 * `state.phase` / `state.createdAt` / `state.lastActivity` (which are always
 * `undefined` after a DB round-trip). Also re-seeds the `__roles__` and
 * `__lobby_settings__` sentinels (B3).
 */
export function seedFigureMapFromState(map: Map<string, any>, state: any): void {
  if (!state) return;
  if (state.figures) {
    if (Array.isArray(state.figures)) {
      for (const fig of state.figures) {
        if (fig && fig.id) map.set(fig.id, fig);
      }
    } else if (typeof state.figures === 'object') {
      for (const [fid, fig] of Object.entries(state.figures)) {
        if (fig) map.set(fid, fig);
      }
    }
  }
  if (state.coachingSteps) {
    map.set('__coaching_steps__', { id: '__coaching_steps__', ...state.coachingSteps });
  }
  if (state.sessionPhase) {
    map.set('__session_phase__', { id: '__session_phase__', phase: state.sessionPhase });
  }
  if (state.sessionCode) {
    map.set('__session_code__', { id: '__session_code__', code: state.sessionCode });
  }
  if (state.adminTokenHolder) {
    map.set('__admin_token_holder__', { id: '__admin_token_holder__', playerId: state.adminTokenHolder });
  }
  if (state.sessionCreatedAt) {
    map.set('__session_created_at__', { id: '__session_created_at__', ts: state.sessionCreatedAt });
  }
  if (state.sessionLastActivity) {
    map.set('__session_last_activity__', { id: '__session_last_activity__', ts: state.sessionLastActivity });
  }
  if (state.stiffness !== undefined) {
    map.set('__stiffness__', { id: '__stiffness__', value: state.stiffness });
  }
  if (state.roles && typeof state.roles === 'object') {
    map.set('__roles__', { id: '__roles__', roles: state.roles });
  }
  if (state.lobbySettings && typeof state.lobbySettings === 'object') {
    map.set('__lobby_settings__', { id: '__lobby_settings__', settings: state.lobbySettings });
  }
}

export function ensureFigureLocks(room: string): Map<string, { userId: string; name: string; color: string }> {
  let m = figureLocks.get(room);
  if (!m) { m = new Map(); figureLocks.set(room, m); }
  return m;
}

export function acquireFigureLock(room: string, figureId: string, owner: { userId: string; name: string; color: string }): boolean {
  const locks = ensureFigureLocks(room);
  if (locks.has(figureId)) return false;
  locks.set(figureId, owner);
  return true;
}

export function releaseFigureLock(room: string, figureId: string, userId: string): boolean {
  const locks = ensureFigureLocks(room);
  const cur = locks.get(figureId);
  if (!cur || cur.userId !== userId) return false;
  locks.delete(figureId);
  return true;
}

export function releaseLocksForUser(room: string, userId: string): void {
  const locks = ensureFigureLocks(room);
  for (const [fid, owner] of locks.entries()) {
    if (owner.userId === userId) locks.delete(fid);
  }
}

/**
 * Owner-orphan handling (C6). When a figure owner leaves the room or is demoted
 * to beobachter, every figure they own must be released (ownerId → null) so a
 * permitted role can take over. Scans + mutates only the room's figureMap and
 * returns the changed figure ids (order-insensitive). Tolerates unknown user /
 * missing room. Broadcast of `figure_owner_changed` is the caller's job.
 */
export function orphanFiguresForUser(room: string, userId: string): string[] {
  const figs = figureMaps.get(room);
  if (!figs || !userId) return [];
  const changed: string[] = [];
  for (const [fid, fig] of figs.entries()) {
    if (fig && fig.ownerId === userId) {
      figs.set(fid, { ...fig, ownerId: null });
      changed.push(fid);
    }
  }
  return changed;
}

export function listFigureLocks(room: string): Array<{ figureId: string; userId: string; name: string; color: string }> {
  const locks = figureLocks.get(room);
  if (!locks) return [];
  return [...locks.entries()].map(([figureId, o]) => ({ figureId, userId: o.userId, name: o.name, color: o.color }));
}
