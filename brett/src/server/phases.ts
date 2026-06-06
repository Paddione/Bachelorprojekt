import type { Phase } from '../types/state';

export const TERMINAL_PHASES = new Set<Phase>(['ended']);
export const VALID_PHASES = new Set<Phase>(['warmup', 'active', 'paused', 'ended']);

type FigureMaps = Map<string, Map<string, any>>;
type ApplyMutation = (room: string, msg: any) => void;

let figureMaps: FigureMaps;
let applyMutation: ApplyMutation;

export function initPhases(deps: { figureMaps: FigureMaps; applyMutation: ApplyMutation }): void {
  figureMaps = deps.figureMaps;
  applyMutation = deps.applyMutation;
}

export function transitionPhase(room: string, newPhase: Phase): { ok: boolean; from?: Phase | null; to?: Phase; reason?: string } {
  if (!VALID_PHASES.has(newPhase)) return { ok: false, reason: 'invalid-phase' };
  const map = figureMaps.get(room);
  const current = map?.get('__session_phase__')?.phase as Phase | undefined | null;
  if (current && TERMINAL_PHASES.has(current)) return { ok: false, reason: 'terminal-phase', from: current, to: newPhase };
  applyMutation(room, { type: 'session_phase_set', phase: newPhase });
  return { ok: true, from: current, to: newPhase };
}

export function buildStateFromMutations(room: string): any {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const SPECIAL = [
    '__optik__', '__stiffness__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
    '__coaching_steps__', '__roles__', '__lobby_settings__',
  ];
  const figures = Array.from(figs.values()).filter(f => !SPECIAL.includes(f.id));
  const optikEntry        = figs.get('__optik__');
  const stiffEntry        = figs.get('__stiffness__');
  const phaseEntry         = figs.get('__session_phase__');
  const codeEntry          = figs.get('__session_code__');
  const adminTokenEntry    = figs.get('__admin_token_holder__');
  const createdAtEntry     = figs.get('__session_created_at__');
  const lastActivityEntry  = figs.get('__session_last_activity__');
  const result: any = { figures };
  if (optikEntry)    result.optik     = optikEntry.settings;
  if (stiffEntry)    result.stiffness = stiffEntry.value;
  if (phaseEntry)        result.sessionPhase       = phaseEntry.phase;
  if (codeEntry)         result.sessionCode        = codeEntry.code;
  if (adminTokenEntry)   result.adminTokenHolder   = adminTokenEntry.playerId;
  if (createdAtEntry)    result.sessionCreatedAt   = createdAtEntry.ts;
  if (lastActivityEntry) result.sessionLastActivity = lastActivityEntry.ts;
  const coachingStepsEntry = figs.get('__coaching_steps__');
  if (coachingStepsEntry) result.coachingSteps = { steps: coachingStepsEntry.steps, index: coachingStepsEntry.index };
  const rolesEntry         = figs.get('__roles__');
  const lobbySettingsEntry = figs.get('__lobby_settings__');
  if (rolesEntry)         result.roles         = rolesEntry.roles;
  if (lobbySettingsEntry) result.lobbySettings = lobbySettingsEntry.settings;
  return result;
}
