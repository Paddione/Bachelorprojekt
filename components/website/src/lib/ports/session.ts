// Ports facade — session seam (W2-A). External callers (scripts/*) import
// website session access ONLY through here, never lib/auth directly.
// Re-export only: no behavior change. Per-request, no cache (as defined
// by the seam). KEIN DB-Pool-Export, KEIN ensureSessionsTable.
export type { SessionResolver } from '../auth';
export { DbSessionResolver, getSessionWithResolver } from '../auth';
