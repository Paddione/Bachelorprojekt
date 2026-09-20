#!/usr/bin/env bash
# scripts/devmesh/migrate-from-k3d.sh — T900118, ADR-008 SP-3, umgeschrieben fuer T900120 (SP-5).
#
# Quelle ist seit T900120 NICHT mehr der k3d-Cluster: `k3d cluster list` ist leer, der Cluster
# mentolder-dev ist abgebaut. Was von ihm bleibt, ist der Abzug
#   ~/backups/k3d-mentolder-dev-shared-db-final-2026-08-23.sql.gz  (pg_dumpall, 2026-08-23)
# Das Skript zaehlt die Zeilen je Tabelle aus diesem Dump und vergleicht sie mit der
# devmesh-shared-db. Es schreibt nichts: kein Restore, kein Scale, kein DDL.
#
# Unterbefehle:
#   preflight   Ziel ist nicht Produktion, Ziel-Context vorhanden, Dump lesbar
#   counts      Zeilenzahl je Tabelle aus dem Dump nach $DUMP_DIR/<db>.counts
#   verify      Zeilenzahlen des Ziels gegen die aus dem Dump erhobene Zaehlung
#   all         preflight, counts, verify
# Exit: 0 ok, 1 Befund (Abweichung, verweigertes Ziel), 2 Vorbedingung fehlt
#
# Der frueher hier gepruefte POCKET_ID_ENCRYPTION_KEY-Vergleich entfaellt: der Quell-Key lag im
# Kubernetes-Secret des abgebauten Clusters, nicht im Dump. Weicht der Key im Ziel vom damaligen
# ab, sind die pocket_id-Daten (Passkeys, OIDC-Client-Secrets) unlesbar — das faellt beim
# Zeilenvergleich NICHT auf, weil die Zeilen da sind.
set -euo pipefail

DST_CTX="${DEVMESH_DST_CTX:-devmesh}"
NS="${DEVMESH_NS:-workspace}"
DBS="${DEVMESH_MIGRATE_DBS:-pocket_id website}"
DUMP_DIR="${DEVMESH_DUMP_DIR:-tmp/devmesh-migration}"
SRC_DUMP="${DEVMESH_SRC_DUMP:-$HOME/backups/k3d-mentolder-dev-shared-db-final-2026-08-23.sql.gz}"

# Exakte Zeilenzahl je Tabelle im Ziel — count(*), keine Statistik-Schaetzung.
COUNT_SQL="SELECT table_schema || '.' || table_name || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
     table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { echo "FEHLT: $*" >&2; exit 2; }

_guard_dst() {
  case "$DST_CTX" in
    fleet|*prod*) die "Ziel verweigert: DST_CTX='$DST_CTX' ist Produktion" ;;
  esac
}

_pod() {
  local pod
  pod="$(kubectl get pod -n "$NS" --context "$DST_CTX" -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
  [[ -n "$pod" ]] || need "kein laufender shared-db-Pod in $NS (Context $DST_CTX)"
  echo "$pod"
}

_psql() { # <db> <sql> — nur lesend gegen das Ziel
  local pod; pod="$(_pod)"
  kubectl exec -i "$pod" -n "$NS" --context "$DST_CTX" -c postgres -- \
    psql -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 -c "$2"
}

_dump_stream() { # Dump lesen, gepackt oder nicht
  if [[ "$(head -c2 "$SRC_DUMP" | od -An -tx1 | tr -d ' \n')" == "1f8b" ]]; then
    gzip -cd -- "$SRC_DUMP"
  else
    cat -- "$SRC_DUMP"
  fi
}

cmd_preflight() {
  _guard_dst
  local ctxs
  [[ -r "$SRC_DUMP" ]] || need "Dump-Datei '$SRC_DUMP' (DEVMESH_SRC_DUMP)"
  if [[ "$(head -c2 "$SRC_DUMP" | od -An -tx1 | tr -d ' \n')" == "1f8b" ]]; then
    gzip -t -- "$SRC_DUMP" 2>/dev/null || need "Dump-Datei '$SRC_DUMP' ist kein lesbares gzip"
  fi
  ctxs="$(kubectl config get-contexts -o name 2>/dev/null)"
  grep -qx "$DST_CTX" <<<"$ctxs" || need "Kubeconfig-Context '$DST_CTX'"
  echo "preflight ok: $SRC_DUMP -> $DST_CTX ($NS), DBs: $DBS"
}

# Zaehlt je \connect-Abschnitt die Datenzeilen jedes COPY-Blocks bis zum abschliessenden \.
cmd_counts() {
  mkdir -p "$DUMP_DIR"
  local db
  for db in $DBS; do : > "$DUMP_DIR/$db.counts"; done
  _dump_stream | awk -v dbs=" $DBS " '
    function flush_tbl() { if (tbl != "") { print db "|" tbl "|" n; tbl = "" } }
    /^\\connect / {
      flush_tbl()
      d = $2; gsub(/^"|";?$|;$/, "", d); db = d; next
    }
    /^COPY .* FROM stdin;/ {
      if (index(dbs, " " db " ") == 0) { incopy = 0; next }
      t = $2
      if (t !~ /\./) t = "public." t
      tbl = t; n = 0; incopy = 1; next
    }
    incopy && /^\\\.$/ { flush_tbl(); incopy = 0; next }
    incopy { n++ }
  ' | while IFS='|' read -r db tbl n; do
    printf '%s|%s\n' "$tbl" "$n" >> "$DUMP_DIR/$db.counts"
  done
  for db in $DBS; do
    echo "counts $db: $(grep -c . < "$DUMP_DIR/$db.counts") Tabellen aus $SRC_DUMP"
  done
}

cmd_verify() {
  _guard_dst
  local db t exp act actual diff=0
  for db in $DBS; do
    [[ -f "$DUMP_DIR/$db.counts" ]] || need "$DUMP_DIR/$db.counts — erst counts"
    actual="$(_psql "$db" "$COUNT_SQL")"
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
  [[ $diff -eq 0 ]] || die "Zeilenzahlen weichen ab — Dump unveraendert, Ziel nicht angefasst"
  echo "verify ok: alle Tabellen stimmen ueberein"
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  counts)    cmd_counts ;;
  verify)    cmd_verify ;;
  all)       cmd_preflight; cmd_counts; cmd_verify ;;
  *)         sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
