// Reine Serialisierungs-Helfer für die BeatState-Persistenz. BeatState[] wird in der
// bestehenden JSONB-Spalte coaching.session_steps.coach_inputs abgelegt (kein Schema-Change).
// S2-Leaf: kein Import aus db-/api-Schichten.

export interface BeatState {
  beatIndex: number;
  captured?: string;
  inputs?: Record<string, string>;
  aiResponse?: string | null;
  status: 'pending' | 'seen' | 'generated' | 'accepted' | 'skipped';
}

/** BeatState[] → JSON-String für die coach_inputs-JSONB-Spalte. */
export function serializeBeats(beats: BeatState[] | undefined): string {
  return JSON.stringify(beats ?? []);
}

/** JSONB-Wert (Array oder JSON-String) → BeatState[]; toleriert Alt-/Leerdaten. */
export function deserializeBeats(raw: unknown): BeatState[] {
  if (Array.isArray(raw)) return raw as BeatState[];
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as BeatState[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
