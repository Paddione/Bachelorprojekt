#!/usr/bin/env bash
# scripts/devmesh/migrate-from-k3d.sh — T900118, ADR-008 SP-3, design.md D6.
#
# Kopiert pocket_id und website aus k3d-mentolder-dev nach devmesh und vergleicht die
# Zeilenzahl jeder Tabelle. Die Quelle wird nur gelesen: kein Scale, kein Restore,
# kein DDL gegen SRC_CTX. Abbau der Quelle erst in SP-5 nach bestandenem verify.
#
# Unterbefehle:
#   preflight   Contexts vorhanden, Ziel nicht Produktion, POCKET_ID_ENCRYPTION_KEY gleich
#   dump        Zaehlung + pg_dump -Fc je DB aus der Quelle (Port-Forward)
#   restore     Ziel-Schreiber auf 0 Replicas, pg_restore --clean je DB
#   verify      Zeilenzahlen des Ziels gegen die beim Dump erhobene Zaehlung
#   all         preflight, dump, restore, verify, Schreiber wieder auf 1 Replica
# Exit: 0 ok, 1 Befund (Abweichung, verweigertes Ziel), 2 Vorbedingung fehlt
set -euo pipefail

SRC_CTX="${DEVMESH_SRC_CTX:-k3d-mentolder-dev}"
DST_CTX="${DEVMESH_DST_CTX:-devmesh}"
NS="${DEVMESH_NS:-workspace}"
DBS="${DEVMESH_MIGRATE_DBS:-pocket_id website}"
DUMP_DIR="${DEVMESH_DUMP_DIR:-tmp/devmesh-migration}"
DST_WRITERS="pocket-id sdlc-console website"

# Exakte Zeilenzahl je Tabelle in einem Statement — count(*), keine Statistik-Schaetzung.
COUNT_SQL="SELECT table_schema || '.' || table_name || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
     table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { echo "FEHLT: $*" >&2; exit 2; }

_pod() {
  local pod
  pod="$(kubectl get pod -n "$NS" --context "$1" -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
  [[ -n "$pod" ]] || need "kein laufender shared-db-Pod in $NS (Context $1)"
  echo "$pod"
}

_psql() { # <ctx> <db> <sql>
  local pod; pod="$(_pod "$1")"
  kubectl exec -i "$pod" -n "$NS" --context "$1" -c postgres -- \
    psql -U postgres -d "$2" -qtA -v ON_ERROR_STOP=1 -c "$3"
}

_secret_key() { # <ctx> <key> -> base64
  kubectl get secret workspace-secrets -n "$NS" --context "$1" -o jsonpath="{.data.$2}" 2>/dev/null
}

_guard_dst() {
  case "$DST_CTX" in
    fleet|*prod*|"$SRC_CTX") die "Ziel verweigert: DST_CTX='$DST_CTX' ist Produktion oder die Quelle (restore ersetzt die Ziel-DB)" ;;
  esac
}

_PF_PID=""
_pf_stop() { if [[ -n "$_PF_PID" ]]; then kill "$_PF_PID" 2>/dev/null || true; fi; _PF_PID=""; }
_pf_start() { # <ctx> <port> — Port-Forward statt exec-Streaming (Abbruch bei ~5,8 MB, migrate-tickets.sh)
  local i
  kubectl port-forward -n "$NS" --context "$1" svc/shared-db "$2:5432" >/dev/null 2>&1 &
  _PF_PID=$!
  for i in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$2") 2>/dev/null && return 0
    sleep 1
  done
  _pf_stop; need "Port-Forward 127.0.0.1:$2 kam nicht hoch ($1)"
}
trap _pf_stop EXIT

cmd_preflight() {
  _guard_dst
  local ctxs c src_key dst_key
  ctxs="$(kubectl config get-contexts -o name 2>/dev/null)"
  for c in "$SRC_CTX" "$DST_CTX"; do grep -qx "$c" <<<"$ctxs" || need "Kubeconfig-Context '$c'"; done
  # pocket_id ist mit POCKET_ID_ENCRYPTION_KEY verschluesselt; ein anderer Key im Ziel
  # macht Passkeys und OIDC-Clients nach dem Restore unlesbar.
  src_key="$(_secret_key "$SRC_CTX" POCKET_ID_ENCRYPTION_KEY)"
  dst_key="$(_secret_key "$DST_CTX" POCKET_ID_ENCRYPTION_KEY)"
  [[ -n "$src_key" && -n "$dst_key" ]] || need "POCKET_ID_ENCRYPTION_KEY in workspace-secrets (Quelle oder Ziel)"
  [[ "$src_key" == "$dst_key" ]] || die "POCKET_ID_ENCRYPTION_KEY weicht zwischen $SRC_CTX und $DST_CTX ab — environments/.secrets/dev.yaml mit dem Quellwert neu versiegeln"
  echo "preflight ok: $SRC_CTX -> $DST_CTX ($NS), DBs: $DBS"
}

cmd_dump() {
  command -v pg_dump >/dev/null && command -v pg_restore >/dev/null || need "pg_dump/pg_restore (PostgreSQL-Client 16)"
  mkdir -p "$DUMP_DIR"
  local db pw
  pw="$(_secret_key "$SRC_CTX" SHARED_DB_PASSWORD | base64 -d)"
  for db in $DBS; do
    _psql "$SRC_CTX" "$db" "$COUNT_SQL" > "$DUMP_DIR/$db.counts"
    _pf_start "$SRC_CTX" 15441
    PGPASSWORD="$pw" pg_dump -h 127.0.0.1 -p 15441 -U postgres -d "$db" -Fc --no-owner --no-privileges > "$DUMP_DIR/$db.dump"
    _pf_stop
    [[ "$(head -c5 "$DUMP_DIR/$db.dump")" == "PGDMP" ]] || die "$db.dump ist kein pg_dump-Archiv"
    pg_restore --data-only -f /dev/null "$DUMP_DIR/$db.dump" || die "$db.dump ist unvollstaendig (Transfer abgebrochen)"
    echo "dump $db: $(stat -c%s "$DUMP_DIR/$db.dump") Bytes, $(grep -c . < "$DUMP_DIR/$db.counts") Tabellen"
  done
}

cmd_restore() {
  _guard_dst
  command -v pg_restore >/dev/null || need "pg_restore (PostgreSQL-Client 16)"
  local db w pw
  pw="$(_secret_key "$DST_CTX" SHARED_DB_PASSWORD | base64 -d)"
  for w in $DST_WRITERS; do kubectl --context "$DST_CTX" -n "$NS" scale "deploy/$w" --replicas=0; done
  for db in $DBS; do
    [[ -f "$DUMP_DIR/$db.dump" ]] || need "$DUMP_DIR/$db.dump — erst dump"
    _pf_start "$DST_CTX" 15442
    # Einzelfehler (Rollen, Extensions) sind tolerierbar; massgeblich ist verify.
    PGPASSWORD="$pw" pg_restore -h 127.0.0.1 -p 15442 -U postgres -d "$db" \
      --clean --if-exists --no-owner --no-privileges "$DUMP_DIR/$db.dump" || true
    _pf_stop
  done
}

cmd_verify() {
  local db t exp act actual diff=0
  for db in $DBS; do
    [[ -f "$DUMP_DIR/$db.counts" ]] || need "$DUMP_DIR/$db.counts — erst dump"
    actual="$(_psql "$DST_CTX" "$db" "$COUNT_SQL")"
    while IFS='|' read -r t exp; do
      [[ -n "$t" ]] || continue
      act="$(awk -F'|' -v t="$t" '$1 == t {print $2}' <<<"$actual")"
      if [[ "${act:-0}" == "$exp" ]]; then
        printf '  ok         %s.%s %s\n' "$db" "$t" "$exp"
      else
        printf '  ABWEICHUNG %s.%s erwartet %s, Ziel %s\n' "$db" "$t" "$exp" "${act:-0}"
        diff=1
      fi
    done < "$DUMP_DIR/$db.counts"
  done
  [[ $diff -eq 0 ]] || die "Zeilenzahlen weichen ab — Quelle unveraendert, Ziel-Schreiber bleiben auf 0"
  echo "verify ok: alle Tabellen stimmen ueberein"
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  dump)      cmd_preflight; cmd_dump ;;
  restore)   cmd_restore ;;
  verify)    cmd_verify ;;
  all)       cmd_preflight; cmd_dump; cmd_restore; cmd_verify
             for w in $DST_WRITERS; do kubectl --context "$DST_CTX" -n "$NS" scale "deploy/$w" --replicas=1; done ;;
  *)         sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
