/**
 * Workflow-Status aggregation for the portal "Minimap".
 *
 * Surfaces where a logged-in portal user stands across the few workflow tracks
 * that the portal can actually answer for, server-side, from EXISTING sources:
 *
 *   - Fragebögen   → questionnaire_assignments (questionnaire-db)
 *   - Verträge     → pending signatures (DocuSeal assignments + Nextcloud queue),
 *                    already counted by portal.astro as `pendingSignatures`
 *   - Buchung      → upcoming CalDAV bookings (caldav.getClientBookings)
 *
 * No data is invented: every track is derived from a real, query-able source.
 * If a source is unavailable the track degrades to a neutral "leer" state
 * rather than throwing — the minimap is a read-only orientation aid and must
 * never break the portal render.
 *
 * The pure builder (`buildWorkflowTracks`) is split from the I/O wrapper
 * (`getWorkflowStatus`) so the stage/"du bist hier" logic is unit-testable
 * without a database — mirroring the lib-layer convention in this repo.
 */

import type { UserSession } from './auth';

// ── Public shape ────────────────────────────────────────────────────────────

export type WorkflowTrackKey = 'fragebogen' | 'vertraege' | 'buchung';

/** One row in the minimap: a single workflow the user can be "located" in. */
export interface WorkflowTrack {
  key: WorkflowTrackKey;
  label: string;
  emoji: string;
  /** Human, lowercase German status word used for the badge text. */
  status: 'offen' | 'erledigt' | 'geplant' | 'leer';
  /** 1-based current step ("du bist hier") out of `total` steps. */
  stage: { current: number; total: number };
  href: string;
}

/** Raw inputs the builder aggregates. Shaped to match the real sources but
 *  intentionally minimal so callers can pass already-fetched rows. */
export interface WorkflowSources {
  questionnaires: Array<{ status: string }>;
  pendingSignatures: number;
  bookings: Array<{ start: Date | string; status?: string }>;
  now: Date;
}

// ── Stage helpers (pure, unit-tested) ───────────────────────────────────────

const QUESTIONNAIRE_TOTAL_STAGES = 4;

/** Map a questionnaire assignment lifecycle status to a 1-based stage (1..4). */
export function questionnaireStage(status: string): number {
  switch (status) {
    case 'pending':
      return 1;
    case 'in_progress':
      return 2;
    case 'submitted':
      return 3;
    case 'reviewed':
    case 'archived':
      return QUESTIONNAIRE_TOTAL_STAGES;
    default:
      // dismissed / unknown — treat as not-yet-started (defensive).
      return 1;
  }
}

const QUESTIONNAIRE_TERMINAL = new Set(['reviewed', 'archived', 'dismissed']);

/** A questionnaire is "open" (actionable) while not in a terminal state. */
function isQuestionnaireOpen(status: string): boolean {
  return !QUESTIONNAIRE_TERMINAL.has(status);
}

/** Two-step signature track: pending → signed. */
export function signatureStage(pending: number): { current: number; total: number } {
  return pending > 0 ? { current: 1, total: 2 } : { current: 2, total: 2 };
}

/** Two-step booking track: nothing upcoming → at least one upcoming. */
export function bookingStage(upcoming: number): { current: number; total: number } {
  return upcoming > 0 ? { current: 1, total: 2 } : { current: 2, total: 2 };
}

// ── Track builders (pure) ───────────────────────────────────────────────────

function buildQuestionnaireTrack(
  questionnaires: WorkflowSources['questionnaires'],
): WorkflowTrack {
  const href = `/portal?section=${encodeURIComponent('fragebögen')}`;
  const list = Array.isArray(questionnaires) ? questionnaires : [];

  if (list.length === 0) {
    return {
      key: 'fragebogen',
      label: 'Fragebögen',
      emoji: '📋',
      status: 'leer',
      stage: { current: 1, total: QUESTIONNAIRE_TOTAL_STAGES },
      href,
    };
  }

  const openStages = list
    .filter((q) => isQuestionnaireOpen(q.status))
    .map((q) => questionnaireStage(q.status));

  if (openStages.length === 0) {
    // Everything is terminal → done.
    return {
      key: 'fragebogen',
      label: 'Fragebögen',
      emoji: '📋',
      status: 'erledigt',
      stage: { current: QUESTIONNAIRE_TOTAL_STAGES, total: QUESTIONNAIRE_TOTAL_STAGES },
      href,
    };
  }

  // "Du bist hier" = the least-advanced open assignment: that's the next thing
  // the user actually needs to act on.
  const current = Math.min(...openStages);
  return {
    key: 'fragebogen',
    label: 'Fragebögen',
    emoji: '📋',
    status: 'offen',
    stage: { current, total: QUESTIONNAIRE_TOTAL_STAGES },
    href,
  };
}

function buildSignatureTrack(pendingSignatures: number): WorkflowTrack {
  const pending = Number.isFinite(pendingSignatures) ? Math.max(0, pendingSignatures) : 0;
  return {
    key: 'vertraege',
    label: 'Verträge',
    emoji: '✍️',
    status: pending > 0 ? 'offen' : 'erledigt',
    stage: signatureStage(pending),
    href: '/portal?section=vertraege',
  };
}

function buildBookingTrack(
  bookings: WorkflowSources['bookings'],
  now: Date,
): WorkflowTrack {
  const list = Array.isArray(bookings) ? bookings : [];
  const reference = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();

  const upcoming = list.filter((b) => {
    if ((b.status ?? 'CONFIRMED').toUpperCase() === 'CANCELLED') return false;
    const start = b.start instanceof Date ? b.start : new Date(b.start);
    return !isNaN(start.getTime()) && start.getTime() >= reference.getTime();
  }).length;

  return {
    key: 'buchung',
    label: 'Buchung',
    emoji: '📅',
    status: upcoming > 0 ? 'geplant' : 'leer',
    stage: bookingStage(upcoming),
    // Upcoming bookings are reviewed under Termine; an empty track invites a
    // new booking.
    href: upcoming > 0 ? '/portal?section=termine' : '/portal?section=buchung',
  };
}

/**
 * Pure aggregation: raw sources → ordered `WorkflowTrack[]`.
 * Stable order (fragebogen, vertraege, buchung). Never throws.
 */
export function buildWorkflowTracks(sources: WorkflowSources): WorkflowTrack[] {
  return [
    buildQuestionnaireTrack(sources.questionnaires),
    buildSignatureTrack(sources.pendingSignatures),
    buildBookingTrack(sources.bookings, sources.now),
  ];
}

// ── I/O wrapper ──────────────────────────────────────────────────────────────

/** Injectable data dependencies — defaults wire to the real lib modules.
 *  Lets the wrapper be tested without a live DB / CalDAV. */
export interface WorkflowDeps {
  getCustomerByEmail: (email: string) => Promise<{ id: string } | null>;
  listQAssignmentsForCustomer: (customerId: string) => Promise<Array<{ status: string }>>;
  countPendingDocAssignments: (customerId: string) => Promise<number>;
  getClientBookings: (email: string) => Promise<Array<{ start: Date | string; status?: string }>>;
  now?: () => Date;
}

let cachedDeps: WorkflowDeps | null = null;

/** Lazily import the real lib modules so this file stays importable in a
 *  DB-less unit test (e.g. the pure builder above) without side effects. */
async function defaultDeps(): Promise<WorkflowDeps> {
  if (cachedDeps) return cachedDeps;
  const [{ getCustomerByEmail }, questionnaire, documents, caldav] = await Promise.all([
    import('./messaging-db'),
    import('./questionnaire-db'),
    import('./documents-db'),
    import('./caldav'),
  ]);
  cachedDeps = {
    getCustomerByEmail,
    listQAssignmentsForCustomer: questionnaire.listQAssignmentsForCustomer,
    countPendingDocAssignments: documents.countPendingAssignmentsForCustomer,
    getClientBookings: caldav.getClientBookings,
    now: () => new Date(),
  };
  return cachedDeps;
}

/**
 * Fetch every workflow source for `session` and aggregate into tracks.
 *
 * Best-effort: each source is guarded so a single failing dependency yields a
 * neutral track rather than failing the whole portal render. Returns an empty
 * array only when there is no resolvable customer (anonymous-ish session).
 */
export async function getWorkflowStatus(
  session: UserSession,
  deps?: Partial<WorkflowDeps>,
): Promise<WorkflowTrack[]> {
  const d: WorkflowDeps = { ...(await defaultDeps()), ...deps };
  const now = (d.now ?? (() => new Date()))();

  const customer = await d.getCustomerByEmail(session.email).catch(() => null);

  const [questionnaires, pendingSignatures, bookings] = await Promise.all([
    customer ? d.listQAssignmentsForCustomer(customer.id).catch(() => []) : Promise.resolve([]),
    customer ? d.countPendingDocAssignments(customer.id).catch(() => 0) : Promise.resolve(0),
    d.getClientBookings(session.email).catch(() => []),
  ]);

  return buildWorkflowTracks({
    questionnaires,
    pendingSignatures,
    bookings,
    now,
  });
}
