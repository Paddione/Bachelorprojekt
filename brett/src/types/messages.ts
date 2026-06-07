import type { Figure, FigureAppearance, FigureType, OptikSettings, Participant, Phase, Role } from './state';

// ── Client → Server ──────────────────────────────────────────────
export type ClientMessage =
  | { type: 'join'; room: string; playerId?: string; name?: string }
  | { type: 'request_state_snapshot' }
  | { type: 'add'; figure: Figure }
  | { type: 'move'; id: string; x: number; z: number; facingY: number }
  | { type: 'jump'; id: string }
  | { type: 'update'; id: string; changes: Partial<Figure> & { appearance?: FigureAppearance } }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'stiffness'; value: number }
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number }
  | { type: 'figure_lock'; id: string }
  | { type: 'figure_unlock'; id: string }
  | { type: 'pong' }
  | { type: 'admin_kick'; playerId: string }
  | { type: 'admin_broadcast'; message: string }
  | { type: 'admin_session_create' }
  | { type: 'admin_handoff_token'; targetPlayerId: string }
  | { type: 'admin_round_stop' }
  | { type: 'admin_round_pause' }
  | { type: 'admin_coaching_steps_set'; steps: string[]; index: number }
  | { type: 'admin_round_start' }
  | { type: 'admin_assign_role'; targetPlayerId: string; role: Role }
  | { type: 'admin_assign_figure'; figureId: string; toPlayerId: string | null }
  | { type: 'admin_set_template'; templateId: string }
  | { type: 'admin_set_optik'; settings: OptikSettings }
  | { type: 'lobby_set_ready'; ready: boolean }
  | { type: 'figure_possess'; figureId: string }
  | { type: 'figure_release'; figureId?: string }
  | { type: 'figure_type_set'; figureId: string; figureType: FigureType };

// ── Server → Client ──────────────────────────────────────────────
export type ServerMessage =
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[]; phase?: Phase; sessionCode?: string | null; optik?: OptikSettings; participants?: Participant[] }
  | { type: 'add'; figure: Figure }
  | { type: 'move'; id: string; x: number; z: number; facingY: number }
  | { type: 'jump'; id: string }
  | { type: 'update'; id: string; changes: Partial<Figure> & { appearance?: FigureAppearance } }
  | { type: 'delete'; id: string }
  | { type: 'stiffness'; value: number }
  | { type: 'figure_locked'; id: string; userId: string; name: string; color: string }
  | { type: 'figure_unlocked'; id: string }
  | { type: 'figure_lock_denied'; id: string }
  | { type: 'locks_released_for'; userId: string }
  | { type: 'info'; count: number }
  | { type: 'presence_join'; participant: Participant }
  | { type: 'presence_leave'; userId: string }
  | { type: 'session_created'; code: string }
  | { type: 'session_phase_change'; phase: Phase; transitionedAt: string; reason: string }
  | { type: 'session_ended'; reason?: string }
  | { type: 'admin_token_changed'; holderPlayerId: string | null; reason: string }
  | { type: 'coaching_steps_change'; steps: string[]; index: number }
  | { type: 'role_changed'; userId: string; role: Role }
  | { type: 'figure_owner_changed'; figureId: string; ownerId: string | null }
  | { type: 'lobby_ready_changed'; userId: string; ready: boolean }
  | { type: 'lobby_settings_change'; templateId?: string; optik?: OptikSettings }
  | { type: 'figure_possessed'; figureId: string; playerId: string; playerName?: string }
  | { type: 'figure_released'; figureId: string; playerId: string }
  | { type: 'figure_type_changed'; figureId: string; figureType: FigureType }
  | { type: 'error'; reason: string };

export interface ServerLock {
  figureId: string;
  userId: string;
  name: string;
  color: string;
}

// Discriminant unions of every message tag — used by exhaustiveness tests.
export type ClientMessageType = ClientMessage['type'];
export type ServerMessageType = ServerMessage['type'];

// Compile-time exhaustiveness helper. Pass the never-narrowed value here in a
// switch default branch to force a build error when a tag goes unhandled.
export function assertNever(x: never): never {
  throw new Error('Unhandled message variant: ' + JSON.stringify(x));
}
