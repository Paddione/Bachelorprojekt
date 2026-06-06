import type { Figure } from '../types/state';

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
        const newFig = { ...figData };
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
        const { id: _ignoredId, ...safeChanges } = msg.changes;
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
    case 'clear':
      figs.clear();
      break;
    case 'optik':
      if (msg.settings && typeof msg.settings === 'object') {
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

export function listFigureLocks(room: string): Array<{ figureId: string; userId: string; name: string; color: string }> {
  const locks = figureLocks.get(room);
  if (!locks) return [];
  return [...locks.entries()].map(([figureId, o]) => ({ figureId, userId: o.userId, name: o.name, color: o.color }));
}
