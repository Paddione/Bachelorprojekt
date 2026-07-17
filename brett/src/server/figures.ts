import type { BrettLine } from '../types/state';

export const figureMaps = new Map<string, Map<string, any>>();
export const figureLocks = new Map<string, Map<string, { userId: string; name: string; color: string }>>();

// ── ID-Generator für Anker & Zonen ───────────────────────────────────────────
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
function generateId(): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

// Injected (D7) to read the room's server-authoritative figure set after seeding,
// without a static import cycle with phases.ts. index.ts wires both.
type StateBuilder = (room: string) => any;
let buildStateFromMutations: StateBuilder = () => null;

export function initFigures(deps: { buildStateFromMutations?: StateBuilder }): void {
  if (deps.buildStateFromMutations) buildStateFromMutations = deps.buildStateFromMutations;
}

export function ensureFigureMap(room: string): Map<string, any> {
  let m = figureMaps.get(room);
  if (!m) { m = new Map(); figureMaps.set(room, m); }
  return m;
}

/** Liest den __lines__-Sentinel und gibt eine kopierte lines-Map zurück (oder {}). */
function ensureLines(figs: Map<string, any>): Record<string, BrettLine> {
  return { ...(figs.get('__lines__')?.lines ?? {}) };
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
        // Strip `id`, `ownerId` und `hidden` — ownerId ist server-autoritativ
        // (§5c); hidden darf NUR über den auditierten figure_hide_set-Pfad
        // wechseln (E9), sonst entfällt die delete/add-Übersetzung für
        // Nicht-Leiter und sie behalten eine stale sichtbare Kopie.
        const { id: _ignoredId, ownerId: _ignoredOwner, hidden: _ignoredHidden, ...safeChanges } = msg.changes;
        // E2: Figuren-Opacity server-autoritativ auf 0.2–1.0 klemmen.
        if (typeof safeChanges.opacity === 'number') {
          safeChanges.opacity = Math.max(0.2, Math.min(1, safeChanges.opacity));
        }
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
      // Linien-Cleanup: Lösche alle Linien, die die gelöschte Figur referenzieren.
      if (typeof msg.id === 'string') {
        const linesEntry = figs.get('__lines__');
        if (linesEntry?.lines) {
          const updatedLines = { ...linesEntry.lines };
          for (const [lid, line] of Object.entries(updatedLines) as [string, any][]) {
            if (line.fromId === msg.id || line.toId === msg.id) {
              delete updatedLines[lid];
            }
          }
          figs.set('__lines__', { id: '__lines__', lines: updatedLines });
        }
      }
      break;
    case 'figure_owner_set': {
      // The ONLY mutation that writes Figure.ownerId (server-authoritative).
      // Tolerates null (unassign) and a missing target (no-op, no phantom figure).
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        figs.set(msg.figureId, { ...figs.get(msg.figureId), ownerId: msg.ownerId ?? null });
      }
      break;
    }
    case 'figure_possess': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const fig = figs.get(msg.figureId);
        if (!fig.possessor) {
          figs.set(msg.figureId, { ...fig, possessor: msg.playerId });
        }
      }
      break;
    }
    case 'figure_release': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const fig = figs.get(msg.figureId);
        if (fig.possessor === msg.playerId) {
          figs.set(msg.figureId, { ...fig, possessor: null });
        }
      }
      break;
    }
    case 'figure_release_all': {
      for (const [fid, fig] of figs.entries()) {
        if (fig.possessor === msg.playerId) {
          figs.set(fid, { ...fig, possessor: null });
        }
      }
      break;
    }
    case 'figure_type_set': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId) && msg.figureType) {
        figs.set(msg.figureId, { ...figs.get(msg.figureId), figureType: msg.figureType });
      }
      break;
    }
    case 'figure_note_set': {
      // Notiz-Mutation: Server-autoritativ, max. 1000 Zeichen.
      // figureId muss existieren — kein Phantom-Figure-Erzeugen.
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const note = typeof msg.note === 'string' ? msg.note.slice(0, 1000) : '';
        figs.set(msg.figureId, { ...figs.get(msg.figureId), note });
      }
      break;
    }
    case 'line_create': {
      // Server-generierte ID muss im msg.id enthalten sein (ws-handler setzt sie).
      if (typeof msg.id === 'string' && msg.id &&
          typeof msg.fromId === 'string' && typeof msg.toId === 'string' &&
          msg.fromId !== msg.toId && msg.lineType) {
        const lines = ensureLines(figs);
        // Cap: maximal 100 Linien pro Room.
        if (Object.keys(lines).length >= 100) break;
        lines[msg.id] = {
          id: msg.id,
          fromId: msg.fromId,
          toId: msg.toId,
          lineType: msg.lineType,
          ...(msg.createdBy ? { createdBy: msg.createdBy } : {}),
        };
        figs.set('__lines__', { id: '__lines__', lines });
      }
      break;
    }
    case 'line_delete': {
      if (typeof msg.lineId === 'string') {
        const lines = ensureLines(figs);
        delete lines[msg.lineId];
        figs.set('__lines__', { id: '__lines__', lines });
      }
      break;
    }
    case 'line_type_set': {
      if (typeof msg.lineId === 'string' && msg.lineType) {
        const lines = ensureLines(figs);
        if (lines[msg.lineId]) {
          lines[msg.lineId] = { ...lines[msg.lineId], lineType: msg.lineType };
          figs.set('__lines__', { id: '__lines__', lines });
        }
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
    case 'moderation_spotlight_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, spotlight: msg.figureId ?? null });
      break;
    }
    case 'moderation_dim_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, dim: msg.figureId ?? null });
      break;
    }
    case 'moderation_freeze_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, freeze: !!msg.frozen });
      break;
    }
    case 'anchor_create': {
      if (msg.anchor && typeof msg.anchor === 'object') {
        const existing: any[] = figs.get('__anchors__')?.anchors ?? [];
        const newAnchor = { ...msg.anchor, id: typeof msg.anchor.id === 'string' ? msg.anchor.id : generateId() };
        figs.set('__anchors__', { id: '__anchors__', anchors: [...existing, newAnchor] });
      }
      break;
    }
    case 'anchor_delete': {
      if (typeof msg.anchorId === 'string') {
        const existing: any[] = figs.get('__anchors__')?.anchors ?? [];
        figs.set('__anchors__', { id: '__anchors__', anchors: existing.filter((a: any) => a.id !== msg.anchorId) });
      }
      break;
    }
    case 'zone_create': {
      if (msg.zone && typeof msg.zone === 'object') {
        const existing: any[] = figs.get('__zones__')?.zones ?? [];
        const newZone = { ...msg.zone, id: typeof msg.zone.id === 'string' ? msg.zone.id : generateId() };
        figs.set('__zones__', { id: '__zones__', zones: [...existing, newZone] });
      }
      break;
    }
    case 'zone_update': {
      // E1: verschieben/skalieren/umstylen einer bestehenden Zone. Shallow-Merge
      // NUR der definierten Felder — unbekannte zoneId ist ein No-op (keine
      // Phantom-Zone). Server-autoritativ, leiter-gated via ADMIN_TYPES.
      if (typeof msg.zoneId === 'string') {
        const existing: any[] = figs.get('__zones__')?.zones ?? [];
        let changed = false;
        const updated = existing.map((z: any) => {
          if (z.id !== msg.zoneId) return z;
          changed = true;
          const patch: any = {};
          for (const k of ['x', 'z', 'width', 'height', 'radius', 'label', 'opacity', 'variant'] as const) {
            if (msg[k] !== undefined) patch[k] = msg[k];
          }
          return { ...z, ...patch };
        });
        if (changed) figs.set('__zones__', { id: '__zones__', zones: updated });
      }
      break;
    }
    case 'zone_delete': {
      if (typeof msg.zoneId === 'string') {
        const existing: any[] = figs.get('__zones__')?.zones ?? [];
        figs.set('__zones__', { id: '__zones__', zones: existing.filter((z: any) => z.id !== msg.zoneId) });
      }
      break;
    }
    case 'figure_hide_set': {
      // E9: verdecktes Arbeiten. Setzt Figure.hidden. Existierende Figur nötig
      // (kein Phantom). Filterung passiert am Broadcast-/Snapshot-Rand.
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        figs.set(msg.figureId, { ...figs.get(msg.figureId), hidden: !!msg.hidden });
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
  if (state.optik && typeof state.optik === 'object') {
    // PD-1: re-seed the persisted board-optik. buildStateFromMutations emits
    // state.optik = __optik__.settings, so the round-trip key MUST be `settings`.
    // Without this branch the saved optik is silently dropped on every DB
    // round-trip (figureMaps.delete on last-leave → re-seed on next join).
    map.set('__optik__', { id: '__optik__', settings: state.optik });
  }
  if (state.roles && typeof state.roles === 'object') {
    map.set('__roles__', { id: '__roles__', roles: state.roles });
  }
  if (state.lobbySettings && typeof state.lobbySettings === 'object') {
    map.set('__lobby_settings__', { id: '__lobby_settings__', settings: state.lobbySettings });
  }
  if (state.moderation && typeof state.moderation === 'object') {
    map.set('__moderation__', {
      id: '__moderation__',
      spotlight: state.moderation.spotlight ?? null,
      dim: state.moderation.dim ?? null,
      freeze: state.moderation.freeze ?? false,
    });
  }
  if (state.anchors && Array.isArray(state.anchors) && state.anchors.length > 0) {
    map.set('__anchors__', { id: '__anchors__', anchors: state.anchors });
  }
  if (state.zones && Array.isArray(state.zones) && state.zones.length > 0) {
    map.set('__zones__', { id: '__zones__', zones: state.zones });
  }
  if (state.lines && Array.isArray(state.lines)) {
    const linesMap: Record<string, BrettLine> = {};
    for (const line of state.lines) {
      if (line && typeof line.id === 'string') linesMap[line.id] = line;
    }
    map.set('__lines__', { id: '__lines__', lines: linesMap });
  }
}

/**
 * D6 — Pure template figure-seeder. Clears only the NON-sentinel figures (ids
 * not starting with `__`) and re-adds each template figure via applyMutation('add')
 * so appearance-defaulting and the 200-cap apply. Sentinels (__optik__,
 * __session_phase__, __lobby_settings__, …) are untouched. No DB.
 */
export function seedFiguresFromTemplate(room: string, templateState: any): void {
  const figs = ensureFigureMap(room);
  for (const [id] of figs) {
    if (!id.startsWith('__')) figs.delete(id);
  }
  for (const f of (templateState?.figures ?? [])) {
    if (f && typeof f.id === 'string') {
      applyMutation(room, { type: 'add', figure: f });
    }
  }
}

/**
 * D7 — Template apply orchestrator. Server-authoritative: seeds the room from the
 * loaded snapshot state (NOT a client-supplied figure payload), then broadcasts a
 * `snapshot` of the seeded board so every client renders it. The snapshot is
 * already persisted in server state via the seed, closing the latent
 * "snapshot has no applyMutation case" persistence gap for templates.
 */
export function applyTemplateToRoom(room: string, templateState: any, broadcastFn: (m: any) => void): void {
  seedFiguresFromTemplate(room, templateState);
  const builtFigures = buildStateFromMutations(room)?.figures ?? [];
  broadcastFn({ type: 'snapshot', figures: builtFigures });
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
