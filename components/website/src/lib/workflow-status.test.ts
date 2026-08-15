import { describe, expect, it } from 'vitest';
import {
  buildWorkflowTracks,
  getWorkflowStatus,
  questionnaireStage,
  bookingStage,
  signatureStage,
  type WorkflowDeps,
  type WorkflowSources,
  type WorkflowTrack,
} from './workflow-status';
import type { UserSession } from './auth';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — shaped like the real sources (questionnaire assignments, pending
// signature count, upcoming bookings). Only the fields the aggregator reads.
// ─────────────────────────────────────────────────────────────────────────────

function qa(status: string): { status: string } {
  return { status };
}

const NOW = new Date('2026-06-01T12:00:00Z');

function booking(offsetDays: number, status = 'CONFIRMED'): { start: Date; status: string } {
  const start = new Date(NOW);
  start.setDate(start.getDate() + offsetDays);
  return { start, status };
}

function trackByKey(tracks: WorkflowTrack[], key: string): WorkflowTrack | undefined {
  return tracks.find((t) => t.key === key);
}

describe('questionnaireStage', () => {
  it('maps the lifecycle status to a 1-based stage out of 4', () => {
    expect(questionnaireStage('pending')).toBe(1);
    expect(questionnaireStage('in_progress')).toBe(2);
    expect(questionnaireStage('submitted')).toBe(3);
    expect(questionnaireStage('reviewed')).toBe(4);
    expect(questionnaireStage('archived')).toBe(4);
  });

  it('treats unknown / dismissed status as the first stage (defensive)', () => {
    expect(questionnaireStage('dismissed')).toBe(1);
    expect(questionnaireStage('whatever')).toBe(1);
  });
});

describe('bookingStage', () => {
  it('is "done"/total when no upcoming bookings exist', () => {
    expect(bookingStage(0)).toEqual({ current: 2, total: 2 });
  });
  it('is the first stage when at least one upcoming booking is pending', () => {
    expect(bookingStage(1)).toEqual({ current: 1, total: 2 });
    expect(bookingStage(5)).toEqual({ current: 1, total: 2 });
  });
});

describe('signatureStage', () => {
  it('is open (stage 1/2) while signatures are pending', () => {
    expect(signatureStage(3)).toEqual({ current: 1, total: 2 });
  });
  it('is complete (stage 2/2) when nothing is pending', () => {
    expect(signatureStage(0)).toEqual({ current: 2, total: 2 });
  });
});

describe('buildWorkflowTracks', () => {
  const baseSources: WorkflowSources = {
    questionnaires: [qa('in_progress'), qa('submitted'), qa('archived')],
    pendingSignatures: 2,
    bookings: [booking(-3), booking(4)], // one past, one upcoming
    now: NOW,
  };

  it('returns exactly three tracks in a stable order: fragebogen, vertraege, buchung', () => {
    const tracks = buildWorkflowTracks(baseSources);
    expect(tracks.map((t) => t.key)).toEqual(['fragebogen', 'vertraege', 'buchung']);
  });

  it('every track carries label, emoji, status, stage{current,total} and an href', () => {
    for (const t of buildWorkflowTracks(baseSources)) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
      expect(typeof t.emoji).toBe('string');
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(typeof t.status).toBe('string');
      expect(t.stage.total).toBeGreaterThan(0);
      expect(t.stage.current).toBeGreaterThanOrEqual(1);
      expect(t.stage.current).toBeLessThanOrEqual(t.stage.total);
      expect(t.href).toMatch(/^\/portal\?section=/);
    }
  });

  it('questionnaire track reflects the FURTHEST-along open assignment as "du bist hier"', () => {
    // open assignments: in_progress (stage 2) + submitted (stage 3); archived is done.
    // The least-advanced open one is the actionable "you are here" → stage 2.
    const t = trackByKey(buildWorkflowTracks(baseSources), 'fragebogen')!;
    expect(t.stage.total).toBe(4);
    expect(t.stage.current).toBe(2);
    expect(t.status).toBe('offen');
    expect(t.href).toBe('/portal?section=frageb%C3%B6gen');
  });

  it('questionnaire track is "erledigt" when every assignment is in a terminal state', () => {
    const t = trackByKey(
      buildWorkflowTracks({ ...baseSources, questionnaires: [qa('reviewed'), qa('archived')] }),
      'fragebogen',
    )!;
    expect(t.status).toBe('erledigt');
    expect(t.stage.current).toBe(t.stage.total);
  });

  it('questionnaire track is "leer" (no work) when there are no assignments at all', () => {
    const t = trackByKey(
      buildWorkflowTracks({ ...baseSources, questionnaires: [] }),
      'fragebogen',
    )!;
    expect(t.status).toBe('leer');
  });

  it('signature track is open while pending > 0 and links to the contracts section', () => {
    const t = trackByKey(buildWorkflowTracks(baseSources), 'vertraege')!;
    expect(t.status).toBe('offen');
    expect(t.stage).toEqual({ current: 1, total: 2 });
    expect(t.href).toBe('/portal?section=vertraege');
  });

  it('signature track is "erledigt" with zero pending signatures', () => {
    const t = trackByKey(
      buildWorkflowTracks({ ...baseSources, pendingSignatures: 0 }),
      'vertraege',
    )!;
    expect(t.status).toBe('erledigt');
    expect(t.stage).toEqual({ current: 2, total: 2 });
  });

  it('booking track counts ONLY future bookings relative to `now`', () => {
    // baseSources has one past (-3) and one future (+4) booking → 1 upcoming.
    const t = trackByKey(buildWorkflowTracks(baseSources), 'buchung')!;
    expect(t.status).toBe('geplant');
    expect(t.stage).toEqual({ current: 1, total: 2 });
    expect(t.href).toBe('/portal?section=termine');
  });

  it('booking track prompts a booking ("leer") when nothing upcoming', () => {
    const t = trackByKey(
      buildWorkflowTracks({ ...baseSources, bookings: [booking(-10)] }),
      'buchung',
    )!;
    expect(t.status).toBe('leer');
    expect(t.href).toBe('/portal?section=buchung');
  });

  it('ignores CANCELLED future bookings when deciding upcoming count', () => {
    const t = trackByKey(
      buildWorkflowTracks({ ...baseSources, bookings: [booking(5, 'CANCELLED')] }),
      'buchung',
    )!;
    expect(t.status).toBe('leer');
  });

  it('is resilient to malformed input (missing arrays) — never throws, yields 3 tracks', () => {
    const tracks = buildWorkflowTracks({
      // deliberately under-specified
      questionnaires: undefined as unknown as WorkflowSources['questionnaires'],
      pendingSignatures: undefined as unknown as number,
      bookings: undefined as unknown as WorkflowSources['bookings'],
      now: NOW,
    });
    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.key)).toEqual(['fragebogen', 'vertraege', 'buchung']);
  });
});

describe('getWorkflowStatus (I/O wrapper, injected deps)', () => {
  const session = {
    sub: 'u-1',
    email: 'klient@example.com',
    name: 'Klient',
    preferred_username: 'klient',
    realmRoles: [],
    brand: 'mentolder',
    access_token: '',
    refresh_token: '',
    expires_at: 0,
  } satisfies UserSession;

  function deps(over: Partial<WorkflowDeps> = {}): WorkflowDeps {
    return {
      getCustomerByEmail: async () => ({ id: 'cust-1' }),
      listQAssignmentsForCustomer: async () => [{ status: 'in_progress' }],
      countPendingDocAssignments: async () => 2,
      getClientBookings: async () => [{ start: new Date('2026-07-01T00:00:00Z'), status: 'CONFIRMED' }],
      now: () => NOW,
      ...over,
    };
  }

  it('wires every source through to three populated tracks', async () => {
    const tracks = await getWorkflowStatus(session, deps());
    expect(tracks.map((t) => t.key)).toEqual(['fragebogen', 'vertraege', 'buchung']);
    expect(trackByKey(tracks, 'fragebogen')!.status).toBe('offen');
    expect(trackByKey(tracks, 'vertraege')!.status).toBe('offen');
    expect(trackByKey(tracks, 'buchung')!.status).toBe('geplant');
  });

  it('degrades a single failing source to a neutral track without throwing', async () => {
    const tracks = await getWorkflowStatus(
      session,
      deps({
        listQAssignmentsForCustomer: async () => {
          throw new Error('db down');
        },
      }),
    );
    expect(tracks).toHaveLength(3);
    // failed questionnaire fetch → empty list → "leer", not a thrown error.
    expect(trackByKey(tracks, 'fragebogen')!.status).toBe('leer');
  });

  it('still resolves bookings when there is no customer record', async () => {
    const tracks = await getWorkflowStatus(
      session,
      deps({ getCustomerByEmail: async () => null }),
    );
    expect(trackByKey(tracks, 'fragebogen')!.status).toBe('leer');
    expect(trackByKey(tracks, 'vertraege')!.status).toBe('erledigt');
    expect(trackByKey(tracks, 'buchung')!.status).toBe('geplant');
  });
});
