// website/src/lib/db-pool.ts
// Shared pg.Pool + ensureSchemaOnce cache — extracted from website-db.ts to
// break the import-cycles between website-db ↔ tickets-schema / tickets/transition /
// tickets/reporter-link (G-CQ07). The pool is leaf-most: it depends only on
// `pg`, no application modules. website-db.ts re-exports `pool` /
// `ensureSchemaOnce` for backward compatibility with any external caller.
import pg from 'pg';
import dns from 'dns';

const MEETINGS_DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

// Use Node.js's built-in DNS resolver (dns.resolve4) instead of musl libc's
// getaddrinfo. musl opens a *connected* UDP socket to the ClusterIP, but after
// kube-proxy DNAT the CoreDNS response arrives from the pod IP — a connected
// socket filters it out and times out with EAI_AGAIN. Node's dns.resolve4 uses
// an unconnected socket and is not affected by this source-address mismatch.
function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  dns.resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const { Pool } = pg;
// T001490 Task 5: fail-soft timeouts. The public site must stay
// available when the DB is slow or partitioned off — every request that
// awaits the pool needs an upper bound. Defaults are deliberately tight
// (connection / statement) so a hung query does not pin a request
// indefinitely; the bundled Astro pages already wrap the DB calls in
// `.catch(() => …)` or `try { … } catch {}` so a timeout just yields a
// 204 / empty / static fallback.
//
// `lookup` is not in the public `pg.PoolConfig` typing (it's an
// underlying libpq option we pass through), so we keep the cast
// to `unknown` → `PoolConfig` for the nodeLookup helper.
const poolConfig = {
  connectionString: MEETINGS_DB_URL,
  lookup: nodeLookup,
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 30_000,
  // statement_timeout: max query runtime in milliseconds. Passed as a
  // libpq option so it applies to every checkout from the pool.
  statement_timeout: 2_000,
} as unknown as import('pg').PoolConfig;
export const pool = new Pool(poolConfig);

// Platform/ops-audit pool. This deliberately stays PER-BRAND (== pool).
// An earlier attempt redirected korczewski -> the mentolder (workspace) DB to
// centralize, but a korczewski website pod cannot reach shared-db.workspace
// across namespaces in the fleet cluster (ClusterIP egress -> ECONNREFUSED),
// which broke korczewski admin-ops. Each brand uses its own shared-db.
export const platformPool = pool;

// Schema initialisation must run ONCE per process, not on every request.
// Running idempotent DDL (CREATE TABLE IF NOT EXISTS / ALTER ... ADD CONSTRAINT)
// on the hot path races concurrent requests on the Postgres system catalog,
// throwing "tuple concurrently updated" and poisoning the pooled connection
// (every later save then fails until the pod restarts). The map memoises the
// init promise per logical schema key; a rejected init is evicted so a later
// request can retry. See ticket T000304.
const _schemaInitOnce = new Map<string, Promise<void>>();
export function ensureSchemaOnce(key: string, init: () => Promise<void>): Promise<void> {
  let p = _schemaInitOnce.get(key);
  if (!p) {
    p = init().catch((err) => {
      _schemaInitOnce.delete(key);
      throw err;
    });
    _schemaInitOnce.set(key, p);
  }
  return p;
}

// Test-only: reset the run-once cache so each test starts cold.
export function __resetSchemaInitCacheForTests(): void {
  _schemaInitOnce.clear();
}
