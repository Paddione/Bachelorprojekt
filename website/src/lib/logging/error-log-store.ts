import { Pool } from 'pg';
import dns from 'dns';

// A dedicated, lazily-created pool — NOT the shared src/lib/db-pool.ts
// singleton. logger.ts's errorPersistStream dynamically imports this module
// on every logger.error() call across the whole app (including from
// unrelated test files that never touch error logging themselves); pulling
// in db-pool.ts's heavier module-level setup (DNS lookup, timeouts) that way
// caused Vitest "environment torn down" crashes in otherwise-unrelated test
// files. A plain, on-demand pg.Pool avoids that.
//
// T002681: Die Verbindungsdaten spiegeln db-pool.ts bewusst wider, statt es zu
// importieren — der Import ist genau das, was die Vitest-Abstuerze ausloeste.
// Die Duplizierung ist der Preis dafuer; wer den Wert dort aendert, aendert ihn
// auch hier. Vorher stand hier `process.env.DATABASE_URL`: das ist die
// MIGRATIONS-Variable (src/db/migrate.ts wirft, wenn sie fehlt) und im
// Website-Runtime nie gesetzt. `pg` faellt ohne connectionString still auf
// localhost:5432 zurueck, wo im Pod nichts lauscht — error_log stand deshalb
// seit dem 2026-07-03 auf 0 Zeilen.
const ERROR_LOG_DB_URL = process.env.SESSIONS_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

// Node's DNS-Resolver statt musl-getaddrinfo — siehe die ausfuehrliche
// Begruendung in db-pool.ts (musl oeffnet einen *connected* UDP-Socket; nach der
// kube-proxy-DNAT kommt die CoreDNS-Antwort von der Pod-IP und wird verworfen,
// Ergebnis EAI_AGAIN). Ohne das waere der Pool zwar richtig adressiert, der
// Default-Host aber nicht aufloesbar.
function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  dns.resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

// `lookup` steht nicht im oeffentlichen pg.PoolConfig-Typ (durchgereichte
// libpq-Option) — derselbe Cast wie in db-pool.ts.
//
// Timeouts: bis T002681 verband der Pool auf localhost und scheiterte sofort
// mit ECONNREFUSED. Jetzt geht er ueber das Netz und kann haengen. persistError()
// laeuft im Fehlerpfad — ein blockierender Insert wuerde ausgerechnet dann
// Requests festhalten, wenn ohnehin etwas kaputt ist.
const errorLogPoolConfig = {
  connectionString: ERROR_LOG_DB_URL,
  lookup: nodeLookup,
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 2_000,
} as unknown as import('pg').PoolConfig;

let _pool: Pool | null = null;
export function getErrorLogPool(): Pool {
  if (!_pool) _pool = new Pool(errorLogPoolConfig);
  return _pool;
}

// Test-only: inject a mock pool instead of lazily connecting to a real database.
export function __setPoolForTesting(mockPool: Pool | null): void {
  _pool = mockPool;
}

export interface ErrorLogEntry {
  source: 'server' | 'browser' | 'pod';
  message: string;
  namespace?: string;
  pod_name?: string;
  meta?: Record<string, unknown>;
}

export async function persistError(entry: ErrorLogEntry): Promise<void> {
  try {
    await getErrorLogPool().query(
      `INSERT INTO error_log (source, message, namespace, pod_name, meta) VALUES ($1, $2, $3, $4, $5)`,
      [entry.source, entry.message, entry.namespace ?? null, entry.pod_name ?? null, JSON.stringify(entry.meta ?? {})],
    );
  } catch (err) {
    // Never route this through the pino `logger` — its errorPersistStream
    // calls persistError() on every logger.error(), which would recurse
    // back into this catch block on a persistent DB outage.
    console.error('[error-log] persistError insert failed:', err);
  }
}
