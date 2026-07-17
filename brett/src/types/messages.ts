import type { Anchor, BrettLine, Figure, FigureAppearance, FigureType, LineType, OptikSettings, Participant, Phase, Role, Zone } from './state';

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
  | { type: 'admin_set_board_template'; boardTemplateId: string }
  | { type: 'admin_set_optik'; settings: OptikSettings }
  | { type: 'lobby_set_ready'; ready: boolean }
  | { type: 'figure_possess'; figureId: string }
  | { type: 'figure_release'; figureId?: string }
  | { type: 'figure_type_set'; figureId: string; figureType: FigureType }
  | { type: 'admin_spotlight_set'; figureId: string | null }
  | { type: 'admin_dim_set'; figureId: string | null }
  | { type: 'admin_freeze_set'; frozen: boolean }
  | { type: 'figure_note_set'; figureId: string; note: string }
  | { type: 'anchor_create'; anchor: Omit<Anchor, 'id'> }
  | { type: 'anchor_delete'; anchorId: string }
  | { type: 'zone_create'; zone: Omit<Zone, 'id'> }
  | { type: 'zone_update'; zoneId: string; x?: number; z?: number; width?: number; height?: number; radius?: number; label?: string; opacity?: number; variant?: 'filled' | 'frame' }
  | { type: 'zone_delete'; zoneId: string }
  | { type: 'figure_hide_set'; figureId: string; hidden: boolean }
  | { type: 'session_undo' }
  | { type: 'session_redo' }
  | { type: 'line_create'; fromId: string; toId: string; lineType: LineType }
  | { type: 'line_delete'; lineId: string }
  | { type: 'line_type_set'; lineId: string; lineType: LineType };

// ── Server → Client ──────────────────────────────────────────────
export type ServerMessage =
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[]; phase?: Phase; sessionCode?: string | null; optik?: OptikSettings; participants?: Participant[]; moderation?: { spotlight: string | null; dim: string | null; freeze: boolean }; anchors?: Anchor[]; zones?: Zone[]; lines?: BrettLine[] }
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
  | { type: 'lobby_settings_change'; templateId?: string; coachingTemplateId?: string; optik?: OptikSettings }
  | { type: 'figure_possessed'; figureId: string; playerId: string; playerName?: string }
  | { type: 'figure_released'; figureId: string; playerId: string }
  | { type: 'figure_type_changed'; figureId: string; figureType: FigureType }
  | { type: 'moderation_state'; spotlight: string | null; dim: string | null; freeze: boolean }
  | { type: 'figure_note_changed'; figureId: string; note: string }
  | { type: 'anchor_added'; anchor: Anchor }
  | { type: 'anchor_removed'; anchorId: string }
  | { type: 'zone_added'; zone: Zone }
  | { type: 'zone_updated'; zone: Zone }
  | { type: 'zone_removed'; zoneId: string }
  | { type: 'figure_hidden_changed'; figureId: string; hidden: boolean }
  | { type: 'undo_stack_changed'; canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number }
  | { type: 'error'; reason: string }
  | { type: 'line_created'; line: BrettLine }
  | { type: 'line_deleted'; lineId: string }
  | { type: 'line_type_changed'; lineId: string; lineType: LineType };

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
