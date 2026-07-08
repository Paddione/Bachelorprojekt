import { Pool } from 'pg';

// A dedicated, lazily-created pool — NOT the shared src/lib/db-pool.ts
// singleton. logger.ts's errorPersistStream dynamically imports this module
// on every logger.error() call across the whole app (including from
// unrelated test files that never touch error logging themselves); pulling
// in db-pool.ts's heavier module-level setup (DNS lookup, timeouts) that way
// caused Vitest "environment torn down" crashes in otherwise-unrelated test
// files. A plain, on-demand pg.Pool avoids that.
let _pool: Pool | null = null;
export function getErrorLogPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
