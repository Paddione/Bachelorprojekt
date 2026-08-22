import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { HealthGoal } from './goals-data';

const queryMock = vi.fn();
const spawnMock = vi.fn();
vi.mock('../website-db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { createGoalTickets, goalTicketDescription, goalTicketTitlePrefix } =
  await import('./health-goal-tickets');

function goal(overrides: Partial<HealthGoal> = {}): HealthGoal {
  return {
    id: 'G-CQ06',
    title: '@deprecated-Symbole',
    category: 'Code-Qualität',
    priority: 'B',
    direction: 'lower',
    baseline: 4,
    current: 2,
    target: 1,
    unit: '',
    status: 'at_risk',
    measurement: 'grep -rnE "@deprecated" components/website/src | wc -l',
    source: 'scripts/health-goals-check.sh G-CQ06',
    measured_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

function fakeProc(stdout = 'T000123|uuid-1234\n') {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  queueMicrotask(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('exit', 0);
  });
  return proc;
}

afterEach(() => {
  queryMock.mockReset();
  spawnMock.mockReset();
});

describe('createGoalTickets', () => {
  it('überspringt bei offenem Ticket — spawn wird NICHT aufgerufen', async () => {
    queryMock.mockResolvedValue({ rows: [{ external_id: 'T000100', title: 'HEALTH:G-CQ06 alt' }] });
    const outcomes = await createGoalTickets([goal()]);
    expect(outcomes[0].status).toBe('skipped');
    expect(outcomes[0].existingTitle).toBe('HEALTH:G-CQ06 alt');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('legt ohne offenes Ticket an und parst external_id aus Feld 1', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    spawnMock.mockImplementation(() => fakeProc());
    const outcomes = await createGoalTickets([goal()]);
    expect(outcomes[0]).toEqual({ id: 'G-CQ06', status: 'created', ticketId: 'T000123' });
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe('bash');
    expect(args[0]).toBe('scripts/ticket.sh');
    expect(args).toContain('HEALTH:G-CQ06 @deprecated-Symbole');
    // KEIN enqueue — Dispatch bleibt Operator-Entscheidung
    expect(JSON.stringify(args)).not.toContain('enqueue');
  });

  it('Beschreibung trägt ID, Ist, Soll, Mess-Befehl und Quelle (positiv geprüft)', () => {
    const desc = goalTicketDescription(goal());
    expect(desc).toContain('G-CQ06');
    expect(desc).toContain('Ist (dokumentiert): 2');
    expect(desc).toContain('Zielwert: 1');
    expect(desc).toContain('grep -rnE "@deprecated" components/website/src | wc -l');
    expect(desc).toContain('scripts/health-goals-check.sh G-CQ06');
  });

  it('leere external_id ist failed, kein Erfolg', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    spawnMock.mockImplementation(() => fakeProc('|uuid-only\n'));
    const outcomes = await createGoalTickets([goal()]);
    expect(outcomes[0].status).toBe('failed');
    expect(outcomes[0].error).toMatch(/external_id/);
  });

  it('ein Fehlschlag bricht die übrigen Ziele nicht ab', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    spawnMock
      .mockImplementationOnce(() => {
        const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        queueMicrotask(() => {
          proc.stderr.emit('data', Buffer.from('boom'));
          proc.emit('exit', 1);
        });
        return proc;
      })
      .mockImplementationOnce(() => fakeProc());
    const outcomes = await createGoalTickets([goal({ id: 'G-A' }), goal({ id: 'G-B' })]);
    expect(outcomes[0].status).toBe('failed');
    expect(outcomes[1]).toEqual({ id: 'G-B', status: 'created', ticketId: 'T000123' });
  });

  it('Titel-Präfix ist stabil und ID-tragend', () => {
    expect(goalTicketTitlePrefix('G-CQ06')).toBe('HEALTH:G-CQ06');
  });
});
