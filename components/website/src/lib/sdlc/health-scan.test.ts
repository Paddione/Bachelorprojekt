import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { runHealthScan, HealthScanInputError, SCAN_TIMEOUT_MS } = await import('./health-scan');

function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

afterEach(() => {
  spawnMock.mockReset();
});

describe('runHealthScan', () => {
  it('gibt zwei Einträge unverändert zurück, der nicht messbare ohne actual', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);
    const promise = runHealthScan(['G-A', 'G-B']);
    proc.stdout.emit('data', Buffer.from(JSON.stringify([
      { id: 'G-A', measurable: true, actual: 3, cmp: 'le', target: 5 },
      { id: 'G-B', measurable: false },
    ])));
    proc.emit('exit', 0);
    const results = await promise;
    expect(results).toEqual([
      { id: 'G-A', measurable: true, actual: 3, cmp: 'le', target: 5 },
      { id: 'G-B', measurable: false },
    ]);
    expect('actual' in results[1]).toBe(false);
  });

  it('ergänzt eine fehlende ID als measurable:false (kein stilles Droppen)', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);
    const promise = runHealthScan(['G-A', 'G-MISSING']);
    proc.stdout.emit('data', Buffer.from(JSON.stringify([
      { id: 'G-A', measurable: true, actual: 1, cmp: 'ge', target: 0 },
    ])));
    proc.emit('exit', 0);
    const results = await promise;
    expect(results[1]).toEqual({ id: 'G-MISSING', measurable: false });
  });

  it('kaputtes stdout wirft — kein leeres Ergebnis als Erfolgsmantel', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);
    const promise = runHealthScan(['G-A']);
    proc.stdout.emit('data', Buffer.from('kein json'));
    proc.emit('exit', 0);
    await expect(promise).rejects.toThrow(/JSON/);
  });

  it('Exit 2 ist als Eingabefehler unterscheidbar', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);
    const promise = runHealthScan(['G-BOGUS']);
    proc.stderr.emit('data', Buffer.from('unbekannte Ziel-ID (nicht im generierten Artefakt): G-BOGUS'));
    proc.emit('exit', 2);
    await expect(promise).rejects.toBeInstanceOf(HealthScanInputError);
  });

  it('spawn erhält bash + Argument-ARRAY mit IDs als eigene Elemente (keine Shell)', async () => {
    const proc = fakeProc();
    spawnMock.mockReturnValue(proc);
    const promise = runHealthScan(['G-A;rm -rf /', 'G-B']);
    proc.stdout.emit('data', Buffer.from('[]'));
    proc.emit('exit', 0);
    await promise;
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe('bash');
    expect(Array.isArray(args)).toBe(true);
    expect(args[0]).toBe('scripts/health-goals-scan.sh');
    expect(args).toContain('G-A;rm -rf /');
    expect(args).toContain('G-B');
    // jede ID als eigenes Element — keine zusammengesetzte Kommando-Zeichenkette
    expect(args).toEqual(['scripts/health-goals-scan.sh', 'G-A;rm -rf /', 'G-B']);
  });

  it('Timeout-Konstante ist großzügig gesetzt', () => {
    expect(SCAN_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });
});
