// scripts/llm-proxy/ws-psql.mjs
// Gemeinsamer DB-Pfad des llm-proxy (T900728): ersetzt die entfernten
// Resolve-/PSQL-Helfer der Factory-lib. Verhalten wie gehabt:
// WORKSPACE_PG_URL gewinnt (direktes psql, kein kubectl noetig),
// sonst kubectl exec gegen den shared-db-Pod. SQL kommt ueber stdin,
// TSV geht nach stdout; Exit 3 ohne DB-Zugang.
export const WS_PSQL_SCRIPT = [
  'set -u',
  'if [ -n "${WORKSPACE_PG_URL:-}" ]; then',
  '  exec psql "$WORKSPACE_PG_URL" -qtA -v ON_ERROR_STOP=1',
  'fi',
  'CTX="${WORKSPACE_CTX:-fleet}"',
  'NS="${WORKSPACE_NS:-workspace}"',
  'POD="$(kubectl get pod -n "$NS" --context "$CTX" -l \'app in (shared-db,shared-db-dev)\' --field-selector status.phase=Running -o name 2>/dev/null | head -1)"',
  '[ -n "$POD" ] || exit 3',
  'exec kubectl exec -i "$POD" -n "$NS" --context "$CTX" -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1',
].join('\n');
