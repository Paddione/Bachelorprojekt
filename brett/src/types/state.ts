// Shared domain types for the Systembrett room state.
// Derived from server.js applyMutation / buildStateFromMutations
// and the client STATE/figure shapes.

export type Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended';

export type Role = 'leiter' | 'stellvertreter' | 'beobachter';

export interface OptikSettings {
  floor?: string;
  sky?: 'day' | 'dusk' | 'calm';
  lightMood?: 'neutral' | 'warm' | 'cool';
}

export interface LobbySettings {
  templateId?: string;
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
}
