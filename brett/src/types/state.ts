// Shared domain types for the Systembrett room state.
// Derived from server.js applyMutation / buildStateFromMutations
// and the client STATE/figure shapes.

export type Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended';

export type Role = 'leiter' | 'stellvertreter' | 'beobachter' | 'gast' | 'zuschauer';

export type FigureType = 'coachee' | 'team_active' | 'team_passive' | 'saboteur' | 'resource';

// ── Line types (Slice 4 / T000467) ──────────────────────────────────────────
export type LineType = 'relationship' | 'tension' | 'resource';

export interface BrettLine {
  /** Server-generierte ID (nanoid(8)). */
  id: string;
  /** figureId der Quellfigur. */
  fromId: string;
  /** figureId der Zielfigur. */
  toId: string;
  /** Visueller Linientyp. */
  lineType: LineType;
  /** playerId des Erstellers (informativ). */
  createdBy?: string;
}

export interface OptikSettings {
  floor?: string;
  sky?: 'day' | 'dusk' | 'calm';
  lightMood?: 'neutral' | 'warm' | 'cool';
}

export interface LobbySettings {
  templateId?: string;
  coachingTemplateId?: string;
  optik?: OptikSettings;
  maxParticipants?: number;
  /** Default: false — Stellvertreter darf NICHT add/delete. */
  allowRepresentativeAdd?: boolean;
}

export interface FigureAppearance {
  color?: string;
  face?: string | null;
  body?: string | null;
  accessories?: Record<string, string | null>;
}

export interface Figure {
  id: string;
  x: number;
  z: number;
  facingY: number;
  label?: string;
  color?: string;
  scale?: number;
  preset?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance: FigureAppearance;
  /**
   * SERVER-AUTHORITATIVE. Stripped from all client add/update payloads (like `id`).
   * Changed ONLY via the server-side `figure_owner_set` mutation (driven by
   * admin_assign_figure or a permitted stellvertreter `add`). Phase C.
   */
  ownerId?: string;
  /** Who currently embodies this figure (playerId). Set by figure_possess. */
  possessor?: string | null;
  /** Semantic figure type from the design system. Leader-only via figure_type_set. */
  figureType?: FigureType;
  /**
   * Freitext-Notiz zur Figur (Aussagen, Perspektiven, Statements).
   * Gesetzt via figure_note_set (server-authoritative, via applyMutation).
   */
  note?: string;
  /**
   * Verdecktes Arbeiten (E9). Server-autoritativ, nur via `figure_hide_set`
   * (leiter-exklusiv). Hidden-Figuren werden am Broadcast-/Snapshot-Rand pro
   * Empfänger-Rolle gefiltert — Nicht-Leiter erhalten sie NIE.
   */
  hidden?: boolean;
  /** Nutzersteuerbare Deckkraft der Figur, 0.2–1.0 (E2). Default: 1.0 */
  opacity?: number;
}

export interface Participant {
  userId: string;
  name: string;
  color: string;
  isAdmin?: boolean;
  /** Persisted via the __roles__ sentinel. */
  role?: Role;
  /** Ephemeral live-lobby status — NOT persisted. */
  ready?: boolean;
}

export interface FigureLock {
  figureId: string;
  userId: string;
  name: string;
  color: string;
}

export interface ModerationState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}

export interface RoomState {
  figures: Record<string, Figure>;
  participants: Participant[];
  phase: Phase;
  adminTokenHolder: string | null;
  stiffness?: number;
  sessionCode?: string | null;
  createdAt?: number | null;
  lastActivity?: number | null;
  coachingSteps?: { steps: string[]; index: number } | null;
  roles?: Record<string, Role>;
  moderation?: ModerationState;
  lobbySettings?: LobbySettings;
}

// ── Boden-Anker & Zonen (T000468) ────────────────────────────────────────────

/** Kleiner fester Punkt-Marker auf dem Boden des Bretts. */
export interface Anchor {
  /** Server-seitig generierte ID. */
  id: string;
  /** Board X-Koordinate. */
  x: number;
  /** Board Z-Koordinate. */
  z: number;
  /** Optionale Beschriftung. */
  label?: string;
  /** CSS-Farbe, z.B. '#c8a96e'. Default: '#c8a96e'. */
  color?: string;
}

export type ZoneShape = 'rect' | 'circle';

/** Farbige Fläche auf dem Boden mit optionaler Beschriftung. */
export interface Zone {
  /** Server-seitig generierte ID. */
  id: string;
  /** Mittelpunkt X. */
  x: number;
  /** Mittelpunkt Z. */
  z: number;
  /** Form: 'rect' (Rechteck) oder 'circle' (Kreis). */
  shape: ZoneShape;
  /** Breite in Board-Einheiten (nur für 'rect'). Default: 2.0 */
  width?: number;
  /** Tiefe in Board-Einheiten (nur für 'rect'). Default: 2.0 */
  height?: number;
  /** Radius in Board-Einheiten (nur für 'circle'). Default: 1.5 */
  radius?: number;
  /** Optionale Beschriftung. */
  label?: string;
  /** CSS-Farbe, z.B. '#4ea1ff'. Default: '#4ea1ff'. */
  color?: string;
  /** Deckkraft der Fläche, 0..1. Default: 0.25 */
  opacity?: number;
  /**
   * Darstellungsvariante (E1): 'filled' = gefüllte Fläche (Default),
   * 'frame' = nur Umrandung (verschiebbarer Rahmen).
   */
  variant?: 'filled' | 'frame';
}
