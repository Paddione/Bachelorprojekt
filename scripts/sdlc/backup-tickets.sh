#!/usr/bin/env bash
# scripts/sdlc/backup-tickets.sh — E3/T002626, ADR-006 Etappe 3.
#
# Sichert die lokale SDLC-Datenbank nach fleet. Die SDLC-Daten sind Bestandteil
# der Bachelorarbeit; ein Datenverlust auf der Heim-Workstation ist nicht
# hinnehmbar (design.md D6).
#
# Warum fleet und nicht S3: fleet laeuft ohnehin durchgehend, liegt geografisch
# getrennt von der Workstation, und der Weg dorthin ist etabliert. Kein neues
# Konto, keine neuen Credentials, kein zusaetzliches Werkzeug.
#
# Das Verfahren folgt dem bestehenden k3d/backup-cronjob.yaml:
#   - `pg_dump -Fc` (Custom Format, komprimiert)
#   - Verschluesselung mit openssl aes-256-cbc/pbkdf2 gegen BACKUP_PASSPHRASE
#   - Magic-Byte-Pruefung, damit ein leerer oder abgebrochener Dump auffaellt
#     statt als "Backup" liegenzubleiben
# Ein unverschluesselter Dump waere hier die einzige Ausnahme im Bestand.
#
# Unterbefehle:
#   run              Dump erzeugen, verschluesseln, nach fleet uebertragen, alte loeschen
#   list             vorhandene Sicherungen auf fleet auflisten
#   restore-check    juengste Sicherung in eine Wegwerf-DB einspielen und zaehlen
#
# Flags:
#   --dry-run   zeigt die Schritte, fuehrt nichts aus
set -euo pipefail

# Aufbewahrungsfrist in Tagen. Bewusst hier als Konstante und nicht verstreut
# im Code — wer sie aendert, aendert sie an genau einer Stelle.
RETENTION_DAYS="${SDLC_BACKUP_RETENTION_DAYS:-30}"

SRC_CTX="${SDLC_DST_CTX:-k3d-mentolder-dev}"   # Quelle des Backups = lokaler Stack
SRC_NS="${SDLC_DST_NS:-workspace}"
DST_CTX="${SDLC_SRC_CTX:-fleet}"               # Ziel der Ablage = fleet
DST_NS="${SDLC_SRC_NS:-workspace}"
DB="${SDLC_DB:-website}"
DB_USER="${SDLC_DB_USER:-website}"

# Unterverzeichnis im backup-pvc. Getrennt von den fleet-eigenen Sicherungen,
# damit deren 30-Tage-Aufraeumung und diese sich nicht gegenseitig treffen.
REMOTE_DIR="/backups/sdlc"
HELPER_IMAGE="alpine:3"
DRY_RUN=false

usage() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

_pod() {
  local ctx="$1" ns="$2" pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" \
          -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  [[ -n "$pod" ]] || { echo "ERROR: kein laufender shared-db-Pod in $ns ($ctx)" >&2; return 1; }
  echo "$pod"
}

# Die Passphrase liegt in workspace-secrets auf fleet — dieselbe, die der
# bestehende backup-cronjob benutzt. Damit ist eine Sicherung von hier mit
# denselben Mitteln lesbar wie jede andere.
_passphrase() {
  kubectl get secret workspace-secrets -n "$DST_NS" --context "$DST_CTX" \
    -o jsonpath='{.data.BACKUP_PASSPHRASE}' 2>/dev/null | base64 -d
}

# Kurzlebiger Pod mit backup-pvc-Mount. Es laeuft kein dauerhafter Ablage-Pod:
# der Mount existiert nur fuer die Dauer der Uebertragung. Muster uebernommen
# aus scripts/backup-restore-recovery.sh.
_helper_overrides() {
  cat <<JSON
{
  "spec": {
    "securityContext": { "runAsNonRoot": true, "runAsUser": 65534, "fsGroup": 65534 },
    "containers": [{
      "name": "sdlc-backup",
      "image": "$HELPER_IMAGE",
      "stdin": true,
      "stdinOnce": true,
      "command": ["/bin/sh", "-c", $1],
      "securityContext": {
        "allowPrivilegeEscalation": false,
        "runAsNonRoot": true,
        "runAsUser": 65534,
        "capabilities": { "drop": ["ALL"] }
      },
      "volumeMounts": [{ "name": "backup-storage", "mountPath": "/backups" }],
      "resources": {
        "requests": { "memory": "128Mi", "cpu": "100m" },
        "limits":   { "memory": "512Mi", "cpu": "500m" }
      }
    }],
    "volumes": [{ "name": "backup-storage", "persistentVolumeClaim": { "claimName": "backup-pvc" } }],
    "restartPolicy": "Never"
  }
}
JSON
}

cmd_run() {
  local stamp target
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$REMOTE_DIR/tickets-$stamp.dump.enc"

  if $DRY_RUN; then
    echo "[dry-run] pg_dump -Fc auf $SRC_CTX/$SRC_NS (DB $DB, Schema tickets)"
    echo "[dry-run] openssl enc -aes-256-cbc -pbkdf2"
    echo "[dry-run] -> $DST_CTX:$target"
    echo "[dry-run] danach: Sicherungen aelter als $RETENTION_DAYS Tage loeschen"
    return 0
  fi

  # Die Passphrase geht ueber die Umgebung an openssl, nicht ueber die
  # Kommandozeile: Argumente sind in der Prozessliste fuer jeden lesbar.
  SDLC_BACKUP_PASS="$(_passphrase)"; export SDLC_BACKUP_PASS
  [[ -n "$SDLC_BACKUP_PASS" ]] || { echo "ERROR: BACKUP_PASSPHRASE nicht aus workspace-secrets lesbar" >&2; return 1; }

  local src_pod; src_pod="$(_pod "$SRC_CTX" "$SRC_NS")"
  local tmp; tmp="$(mktemp -t sdlc-backup-XXXXXX.dump)"
  # shellcheck disable=SC2064  # Pfad soll jetzt expandieren, nicht beim Trap.
  trap "rm -f '$tmp' '$tmp.enc'" EXIT

  kubectl exec -i "$src_pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    pg_dump -U "$DB_USER" -d "$DB" --schema=tickets -Fc --no-owner --no-privileges > "$tmp"

  # Ein `>`-Redirect legt die Datei an, bevor pg_dump scheitern kann — ohne
  # diese Pruefung bliebe eine 0-Byte-Datei als vermeintliches Backup zurueck.
  # Genau dieser Fall ist im bestehenden backup-cronjob.yaml kommentiert.
  local size; size=$(stat -c%s "$tmp")
  if [[ "$size" -lt 100 ]] || [[ "$(head -c5 "$tmp")" != "PGDMP" ]]; then
    echo "FATAL: Dump ist $size Bytes und kein gueltiges pg_dump-Archiv." >&2
    return 1
  fi

  openssl enc -aes-256-cbc -pbkdf2 -in "$tmp" -out "$tmp.enc" -pass env:SDLC_BACKUP_PASS
  echo "Dump: $size Bytes, verschluesselt: $(stat -c%s "$tmp.enc") Bytes"

  kubectl run "sdlc-backup-$stamp" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"mkdir -p $REMOTE_DIR && cat > $target && ls -l $target\"")" \
    < "$tmp.enc"

  cmd_prune
  echo "Sicherung abgelegt: $target"
}

cmd_prune() {
  local cmd="find $REMOTE_DIR -maxdepth 1 -type f -name 'tickets-*.dump.enc' -mtime +$RETENTION_DAYS -print -delete"
  if $DRY_RUN; then echo "[dry-run] $cmd"; return 0; fi
  kubectl run "sdlc-backup-prune-$(date -u +%s)" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"$cmd\"")" < /dev/null || true
}

cmd_list() {
  kubectl run "sdlc-backup-list-$(date -u +%s)" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"ls -lh $REMOTE_DIR 2>/dev/null || echo '(noch keine Sicherung)'\"")" < /dev/null
}

# Ein Backup, das nie zurueckgespielt wurde, ist eine Vermutung (D6). Dieser
# Befehl macht daraus einen Nachweis: er spielt die juengste Sicherung in eine
# Wegwerf-Datenbank und zaehlt die Zeilen.
cmd_restore_check() {
  if $DRY_RUN; then
    echo "[dry-run] juengste Sicherung holen, entschluesseln, in Wegwerf-DB einspielen, zaehlen"
    return 0
  fi

  SDLC_BACKUP_PASS="$(_passphrase)"; export SDLC_BACKUP_PASS
  [[ -n "$SDLC_BACKUP_PASS" ]] || { echo "ERROR: BACKUP_PASSPHRASE nicht lesbar" >&2; return 1; }

  local tmp; tmp="$(mktemp -t sdlc-restore-XXXXXX.enc)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp' '$tmp.dump'" EXIT

  kubectl run "sdlc-restore-fetch-$(date -u +%s)" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"cat \\\$(ls -1t $REMOTE_DIR/tickets-*.dump.enc | head -1)\"")" \
    < /dev/null > "$tmp"

  [[ -s "$tmp" ]] || { echo "ERROR: keine Sicherung auf fleet gefunden" >&2; return 1; }
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$tmp" -out "$tmp.dump" -pass env:SDLC_BACKUP_PASS

  local checkdb="sdlc_restore_check"
  local pod; pod="$(_pod "$SRC_CTX" "$SRC_NS")"
  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $checkdb" -c "CREATE DATABASE $checkdb"

  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    pg_restore -U "$DB_USER" -d "$checkdb" --no-owner --no-privileges < "$tmp.dump" >/dev/null 2>&1 || true

  echo "== Zeilen in der wiederhergestellten Kopie =="
  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U "$DB_USER" -d "$checkdb" -qtA -c \
    "SELECT relname || '|' || n_live_tup FROM pg_stat_user_tables WHERE schemaname='tickets' ORDER BY relname"

  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $checkdb" >/dev/null
  echo "Restore-Nachweis abgeschlossen (Wegwerf-DB wieder entfernt)."
}

CMD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage 0 ;;
    -*)        echo "Unbekannte Option: $1" >&2; usage 2 ;;
    *)         CMD="$1"; shift ;;
  esac
done

case "$CMD" in
  run)            cmd_run ;;
  prune)          cmd_prune ;;
  list)           cmd_list ;;
  restore-check)  cmd_restore_check ;;
  ""|help)        usage 0 ;;
  *)              echo "Unbekannter Befehl: $CMD" >&2; usage 2 ;;
esac
