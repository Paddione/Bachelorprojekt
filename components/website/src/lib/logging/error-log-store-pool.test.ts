// Prueft die KONFIGURATION des Error-Log-Pools — nicht sein Query-Verhalten.
//
// Modus: command output verification. Die Tests rufen getErrorLogPool() auf und
// pruefen das Argument, mit dem `pg.Pool` tatsaechlich konstruiert wurde; sie
// greppen nicht die Quelle.
//
// Warum es diese Datei gibt (T002681): error-log-store.test.ts injiziert den Pool
// per __setPoolForTesting() und ueberspringt damit die Erzeugung vollstaendig.
// Genau die einzige so uebersprungene Zeile war falsch — sie las `DATABASE_URL`,
// das im Website-Runtime nie gesetzt ist (es ist die Migrations-Variable). `pg`
// faellt ohne connectionString auf localhost:5432 zurueck, wo im Pod keine
// Datenbank laeuft. Ergebnis: seit Anlage der Tabelle am 2026-07-03 stand
// error_log auf 0 Zeilen, waehrend jeder Schreibversuch still in einem
// console.error endete.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted, weil vi.mock() nach oben gezogen wird und die Factory sonst auf
// eine noch nicht initialisierte Variable zugreift. Die Konfigurationen werden
// gesammelt statt ueber vi.fn().mock.calls gelesen — das haelt die Assertions
// frei von Tuple-Typgymnastik.
const { FakePool, poolConfigs } = vi.hoisted(() => {
  const poolConfigs: Array<{ connectionString?: string; lookup?: unknown }> = [];
  class FakePool {
    query = () => Promise.resolve({ rows: [] });
    constructor(cfg: { connectionString?: string; lookup?: unknown }) {
      poolConfigs.push(cfg);
    }
  }
  return { FakePool, poolConfigs };
});
vi.mock('pg', () => ({ Pool: FakePool, default: { Pool: FakePool } }));

const originalEnv = process.env;

beforeEach(() => {
  poolConfigs.length = 0;
  vi.resetModules();
});
afterEach(() => {
  process.env = originalEnv;
});

async function freshPool() {
  const mod = await import('./error-log-store');
  return mod.getErrorLogPool();
}

describe('getErrorLogPool — Verbindungskonfiguration', () => {
  it('nutzt SESSIONS_DATABASE_URL, dieselbe Quelle wie der uebrige DB-Zugriff', async () => {
    process.env = {
      ...originalEnv,
      SESSIONS_DATABASE_URL: 'postgresql://u:p@db.example.test:5432/website',
      DATABASE_URL: undefined,
    };

    await freshPool();

    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0].connectionString).toBe('postgresql://u:p@db.example.test:5432/website');
  });

  // Regressionstest zu T002681. Gegen die alte Fassung ist connectionString hier
  // `undefined` -> pg verbindet auf localhost:5432 -> jeder Fehler-Log geht
  // verloren. Der Default MUSS auf die geteilte Datenbank zeigen.
  it('faellt ohne jede Env-Variable NICHT auf localhost zurueck', async () => {
    process.env = { ...originalEnv, SESSIONS_DATABASE_URL: undefined, DATABASE_URL: undefined };

    await freshPool();

    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0].connectionString).toBeTruthy();
    expect(poolConfigs[0].connectionString).toContain('shared-db.workspace.svc.cluster.local');
    expect(poolConfigs[0].connectionString).not.toContain('localhost');
  });

  // Der Default-Host ist ein DNS-Name. Das Website-Image ist musl-basiert, wo
  // getaddrinfo hinter der kube-proxy-DNAT mit EAI_AGAIN scheitert — derselbe
  // Grund, aus dem db-pool.ts einen eigenen lookup mitgibt. Ohne ihn waere der
  // Pool zwar richtig adressiert, aber nicht aufloesbar.
  it('gibt einen eigenen DNS-lookup mit (musl/kube-proxy)', async () => {
    process.env = { ...originalEnv, SESSIONS_DATABASE_URL: undefined, DATABASE_URL: undefined };

    await freshPool();

    expect(poolConfigs).toHaveLength(1);
    expect(typeof poolConfigs[0].lookup).toBe('function');
  });
});
