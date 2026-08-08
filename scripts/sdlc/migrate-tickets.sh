#!/usr/bin/env bash
# scripts/sdlc/migrate-tickets.sh — E3/T002626, ADR-006 Etappe 3.
#
# Verlagert das `tickets`-Schema von der fleet-Produktionsdatenbank in die
# lokale SDLC-Datenbank und friert die fleet-Kopie danach gegen Schreibzugriffe
# ein.
#
# Warum die Unterbefehle einzeln aufrufbar sind: der Cutover ist ein
# Betriebsvorgang, den ein Mensch nach docs/sdlc-stack/e3-cutover.md
# durchfuehrt — nicht ein Skriptlauf, der 36.700 Zeilen unbeaufsichtigt
# verschiebt. Jeder Schritt ist wiederholbar und liefert seinen Nachweis
# selbst.
#
# `tickets.provider_config` wird bewusst NICHT migriert (design.md D1):
# coaching.sessions.ki_config_id referenziert die Tabelle mit 13 Zeilen, und
# Coaching bleibt laut ADR-006 auf fleet. Der lokale Stack bekommt per
# `seed-provider-config` eine eigene Instanz mit derselben Struktur und
# unabhaengigem Inhalt.
#
# Unterbefehle:
#   preflight              Vorbedingungen pruefen, sonst nichts
#   dump                   fleet -> Dumpdatei (+ Zeilenzaehlung daneben)
#   restore                Dumpdatei -> lokale DB, danach Zeilenvergleich
#   seed-provider-config   lokale provider_config anlegen (keine Kopie)
#   freeze                 fleet-Kopie schreibgeschuetzt stellen
#   status                 Zeilenzahlen beider Seiten nebeneinander
#
# Globale Flags:
#   --dry-run   zeigt das auszufuehrende SQL/Kommando, sendet nichts
#   --force     ueberschreibt ein bereits befuelltes lokales Schema (restore)
set -euo pipefail

SRC_CTX="${SDLC_SRC_CTX:-fleet}"
SRC_NS="${SDLC_SRC_NS:-workspace}"
DST_CTX="${SDLC_DST_CTX:-k3d-mentolder-dev}"
DST_NS="${SDLC_DST_NS:-workspace}"
DB="${SDLC_DB:-website}"
DB_USER="${SDLC_DB_USER:-website}"

# Die einzige Tabelle, die auf fleet bleibt (D1). Als Variable, damit
# freeze/dump/status dieselbe Wahrheit benutzen statt sie je einzeln zu nennen.
KEEP_ON_FLEET="provider_config"

DUMP_DIR="${SDLC_DUMP_DIR:-tmp/sdlc-migration}"
DRY_RUN=false
FORCE=false

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- Cluster-Zugriff ---------------------------------------------------------
# Dieselbe Aufloesung wie scripts/vda/ticket/_ticket-core.sh::_pgpod: der
# shared-db-Pod wird ueber sein app-Label gesucht, nicht ueber einen festen
# Namen (der traegt einen ReplicaSet-Hash).
_pod() {
  local ctx="$1" ns="$2" pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" \
          -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "ERROR: kein laufender shared-db-Pod in $ns (Kontext $ctx)" >&2
    return 1
  fi
  echo "$pod"
}

_psql() {
  local ctx="$1" ns="$2"; shift 2
  local pod; pod=$(_pod "$ctx" "$ns")
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U "$DB_USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 "$@"
}

_table_list() {
  local ctx="$1" ns="$2"
  _psql "$ctx" "$ns" -c \
    "SELECT tablename FROM pg_tables WHERE schemaname='tickets' ORDER BY tablename"
}

# Zeilenzahl je Tabelle des tickets-Schemas, als "tabelle|anzahl" sortiert.
# Bewusst COUNT(*) statt pg_stat_user_tables.n_live_tup: letzteres ist eine
# Schaetzung des Autovacuum und taugt nicht als Migrations-Nachweis.
_counts_for() {
  local ctx="$1" ns="$2" tables sql t
  tables=$(_table_list "$ctx" "$ns")
  [[ -z "$tables" ]] && return 0
  sql=""
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    [[ -n "$sql" ]] && sql+=" UNION ALL "
    sql+="SELECT '$t' AS t, count(*) AS n FROM tickets.\"$t\""
  done <<< "$tables"
  _psql "$ctx" "$ns" -c "SELECT t || '|' || n FROM ($sql) q ORDER BY t"
}

_say_or_run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

# --- preflight ---------------------------------------------------------------
cmd_preflight() {
  local rc=0

  echo "== Quelle: Kontext $SRC_CTX, Namespace $SRC_NS =="
  if _pod "$SRC_CTX" "$SRC_NS" >/dev/null 2>&1; then
    echo "  shared-db erreichbar"
    echo "  tickets-Tabellen: $(_table_list "$SRC_CTX" "$SRC_NS" | grep -c . || echo 0)"
  else
    echo "  FEHLT: kein laufender shared-db-Pod" >&2
    rc=1
  fi

  echo "== Ziel: Kontext $DST_CTX, Namespace $DST_NS =="
  if ! kubectl config get-contexts -o name 2>/dev/null | grep -qx "$DST_CTX"; then
    echo "  FEHLT: Kubeconfig-Kontext '$DST_CTX' existiert nicht" >&2
    echo "         Der lokale Stack wird mit 'task sdlc:cluster:create' angelegt." >&2
    return 1
  fi
  if ! _pod "$DST_CTX" "$DST_NS" >/dev/null 2>&1; then
    echo "  FEHLT: kein laufender shared-db-Pod im lokalen Cluster" >&2
    echo "         Laeuft Docker? Ist der Stack deployt ('task sdlc:deploy')?" >&2
    return 1
  fi
  echo "  shared-db erreichbar"

  # Ein bereits befuelltes Zielschema ist der gefaehrlichste Zustand: ein
  # Restore darueber mischt zwei Bestaende, ohne dass es auffaellt.
  local dst_rows
  dst_rows=$(_counts_for "$DST_CTX" "$DST_NS" | awk -F'|' '{s+=$2} END {print s+0}')
  echo "  Zeilen im lokalen tickets-Schema: ${dst_rows}"
  if [[ "${dst_rows:-0}" -gt 0 ]] && ! $FORCE; then
    echo "  ABBRUCH: das lokale tickets-Schema ist nicht leer." >&2
    echo "           Ein Restore darueber vermischt zwei Bestaende. Mit --force erzwingen." >&2
    rc=1
  fi

  return $rc
}

# --- dump --------------------------------------------------------------------
cmd_dump() {
  local stamp dump counts pod
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump="$DUMP_DIR/tickets-$stamp.sql"
  counts="$DUMP_DIR/tickets-$stamp.counts"

  # Der Dry-Run laeuft VOR dem Preflight: er soll zeigen, was geschaehe, auch
  # wenn das Ziel gerade nicht erreichbar ist. Andernfalls liesse sich das
  # Kommando nie ansehen, solange der lokale Cluster aus ist.
  if $DRY_RUN; then
    echo "[dry-run] pg_dump -n tickets --exclude-table=tickets.$KEEP_ON_FLEET -> $dump"
    echo "[dry-run] Zeilenzaehlung -> $counts"
    return 0
  fi

  cmd_preflight >/dev/null || { cmd_preflight; return 1; }

  mkdir -p "$DUMP_DIR"
  pod=$(_pod "$SRC_CTX" "$SRC_NS")

  # Die Zaehlung entsteht VOR dem Dump und wandert mit ihm. Sie ist der einzige
  # Massstab, an dem der Restore sich messen laesst — eine spaeter erhobene
  # Zaehlung der Quelle koennte bereits abweichen.
  _counts_for "$SRC_CTX" "$SRC_NS" > "$counts"

  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    pg_dump -U "$DB_USER" -d "$DB" \
      --schema=tickets \
      --exclude-table="tickets.$KEEP_ON_FLEET" \
      --no-owner --no-privileges \
    > "$dump"

  echo "Dump:     $dump ($(wc -l < "$dump") Zeilen SQL)"
  echo "Zaehlung: $counts ($(grep -c . < "$counts") Tabellen)"
  echo "$dump"
}

# --- restore -----------------------------------------------------------------
cmd_restore() {
  local dump="${1:-}"
  if [[ -z "$dump" ]]; then
    dump=$(ls -1t "$DUMP_DIR"/tickets-*.sql 2>/dev/null | head -1 || true)
  fi
  [[ -n "$dump" && -f "$dump" ]] || { echo "ERROR: kein Dump gefunden (Pfad angeben oder erst 'dump')" >&2; return 2; }
  local counts="${dump%.sql}.counts"

  if $DRY_RUN; then
    echo "[dry-run] psql < $dump  (Ziel: $DST_CTX/$DST_NS)"
    echo "[dry-run] danach Zeilenvergleich gegen $counts"
    return 0
  fi

  cmd_preflight >/dev/null || { cmd_preflight; return 1; }

  local pod; pod=$(_pod "$DST_CTX" "$DST_NS")
  kubectl exec -i "$pod" -n "$DST_NS" --context "$DST_CTX" -c postgres -- \
    psql -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 < "$dump" > /dev/null

  echo "Restore abgeschlossen — vergleiche Zeilenzahlen:"
  _verify_counts "$counts"
}

# Vergleicht die lokale Zaehlung gegen die beim Dump erhobene. Der Vergleich ist
# der eigentliche Nachweis; ein fehlerfreier psql-Lauf beweist nur, dass kein
# Statement geworfen hat.
_verify_counts() {
  local expected_file="$1"
  [[ -f "$expected_file" ]] || { echo "ERROR: Zaehlung $expected_file fehlt" >&2; return 1; }

  local actual diff_found=0 t exp act
  actual=$(_counts_for "$DST_CTX" "$DST_NS")

  while IFS='|' read -r t exp; do
    [[ -z "$t" ]] && continue
    # provider_config wurde bewusst nicht migriert — es darf abweichen.
    [[ "$t" == "$KEEP_ON_FLEET" ]] && continue
    act=$(grep "^$t|" <<< "$actual" | cut -d'|' -f2 || true)
    act="${act:-0}"
    if [[ "$exp" != "$act" ]]; then
      printf '  ABWEICHUNG %-28s erwartet %8s, lokal %8s\n' "$t" "$exp" "$act"
      diff_found=1
    else
      printf '  ok         %-28s %8s\n' "$t" "$exp"
    fi
  done < "$expected_file"

  if [[ $diff_found -ne 0 ]]; then
    echo "FEHLER: Zeilenzahlen weichen ab — der Restore ist unvollstaendig." >&2
    return 1
  fi
  echo "Alle Tabellen stimmen ueberein (ausser $KEEP_ON_FLEET, bewusst nicht migriert)."
}

# --- seed-provider-config ----------------------------------------------------
# Bewusst KEINE Kopie der fleet-Zeilen: die lokale Instanz steuert die Factory,
# die fleet-Instanz bedient Coaching. Uebernommen wird nur die Struktur.
cmd_seed_provider_config() {
  local ddl
  if $DRY_RUN; then
    echo "[dry-run] CREATE TABLE IF NOT EXISTS tickets.$KEEP_ON_FLEET (Struktur aus fleet)"
    return 0
  fi

  ddl=$(_psql "$SRC_CTX" "$SRC_NS" -c \
    "SELECT 'CREATE TABLE IF NOT EXISTS tickets.$KEEP_ON_FLEET (' ||
            string_agg(format('%I %s%s', column_name, data_type,
                              CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END),
                       ', ' ORDER BY ordinal_position) || ')'
       FROM information_schema.columns
      WHERE table_schema='tickets' AND table_name='$KEEP_ON_FLEET'")

  [[ -n "$ddl" ]] || { echo "ERROR: Struktur von $KEEP_ON_FLEET nicht ermittelbar" >&2; return 1; }
  _psql "$DST_CTX" "$DST_NS" -c "$ddl"
  echo "Lokale tickets.$KEEP_ON_FLEET angelegt (leer — Inhalt ist bewusst unabhaengig von fleet)."
}

# --- freeze ------------------------------------------------------------------
cmd_freeze() {
  # SELECT bleibt erlaubt: die Historie soll lesbar bleiben (D2). Entzogen
  # werden nur die schreibenden Rechte, und provider_config bekommt sie sofort
  # zurueck, weil Coaching weiter darauf schreibt.
  local sql
  sql=$(cat <<SQL
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA tickets FROM $DB_USER;
GRANT INSERT, UPDATE, DELETE ON tickets.$KEEP_ON_FLEET TO $DB_USER;
SQL
)
  if $DRY_RUN; then
    echo "[dry-run] auf $SRC_CTX/$SRC_NS:"
    echo "$sql" | sed 's/^/  /'
    return 0
  fi

  _psql "$SRC_CTX" "$SRC_NS" -c "$sql"
  echo "fleet-Kopie eingefroren. SELECT bleibt moeglich, $KEEP_ON_FLEET bleibt schreibbar."
  echo "Rollback: GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tickets TO $DB_USER;"
}

# --- status ------------------------------------------------------------------
cmd_status() {
  echo "== fleet ($SRC_CTX/$SRC_NS) =="
  _counts_for "$SRC_CTX" "$SRC_NS" | sed 's/^/  /' || echo "  (nicht erreichbar)"
  echo "== lokal ($DST_CTX/$DST_NS) =="
  _counts_for "$DST_CTX" "$DST_NS" 2>/dev/null | sed 's/^/  /' || echo "  (nicht erreichbar)"
}

# --- main --------------------------------------------------------------------
CMD=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --force)     FORCE=true; shift ;;
    -h|--help)   usage 0 ;;
    -*)          echo "Unbekannte Option: $1" >&2; usage 2 ;;
    *)           if [[ -z "$CMD" ]]; then CMD="$1"; else ARGS+=("$1"); fi; shift ;;
  esac
done

case "$CMD" in
  preflight)             cmd_preflight ;;
  dump)                  cmd_dump ;;
  restore)               cmd_restore "${ARGS[@]:-}" ;;
  seed-provider-config)  cmd_seed_provider_config ;;
  freeze)                cmd_freeze ;;
  status)                cmd_status ;;
  ""|help)               usage 0 ;;
  *)                     echo "Unbekannter Befehl: $CMD" >&2; usage 2 ;;
esac
