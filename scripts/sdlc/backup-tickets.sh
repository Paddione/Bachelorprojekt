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
# $1 = Kommando (JSON-String), $2 = Pod-/Containername.
# Beide muessen uebereinstimmen: `kubectl run` benennt den Container nach dem
# Pod, und weicht der Name in den Overrides ab, findet `-i` den Container nicht
# und faellt auf Log-Streaming zurueck. Bei Textausgabe faellt das nicht auf,
# bei einem Binaerstrom kommt die Datei beschaedigt an — genau daran scheiterte
# der erste restore-check (T002626).
_helper_overrides() {
  local _name="${2:-sdlc-backup}"
  cat <<JSON
{
  "spec": {
    "securityContext": { "runAsNonRoot": true, "runAsUser": 65534, "fsGroup": 65534, "seccompProfile": { "type": "RuntimeDefault" } },
    "containers": [{
      "name": "$_name",
      "image": "$HELPER_IMAGE",
      "stdin": true,
      "stdinOnce": true,
      "command": ["/bin/sh", "-c", $1],
      "securityContext": {
        "allowPrivilegeEscalation": false,
        "runAsNonRoot": true,
        "runAsUser": 65534,
        "capabilities": { "drop": ["ALL"] },
        "seccompProfile": { "type": "RuntimeDefault" }
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
  # Magic-Bytes belegen nur den Anfang. Ein bei der Uebertragung abgebrochenes
  # Archiv traegt sie ebenso und faellt erst beim Zurueckspielen auf — deshalb
  # laeuft die Pruefung die Datenbloecke bis zum Ende durch (T002626, gemessen
  # an einem bei 5,8 MB abgeschnittenen Dump, den `pg_restore -l` durchwinkte).
  if ! pg_restore --data-only -f /dev/null "$tmp" >/dev/null 2>&1; then
    echo "FATAL: Dump ist unvollstaendig — der Transfer brach ab." >&2
    return 1
  fi

  openssl enc -aes-256-cbc -pbkdf2 -in "$tmp" -out "$tmp.enc" -pass env:SDLC_BACKUP_PASS
  echo "Dump: $size Bytes, verschluesselt: $(stat -c%s "$tmp.enc") Bytes"

  # Pod-Namen brauchen RFC-1123-Kleinschreibung; der ISO-Zeitstempel traegt
  # jedoch T und Z. Ohne die Umwandlung lehnt die API den Pod ab.
  local podname="sdlc-backup-$(printf '%s' "$stamp" | tr '[:upper:]' '[:lower:]')"
  local local_sum; local_sum="$(sha256sum "$tmp.enc" | cut -d" " -f1)"

  # Die Pruefsumme wird IM Container neu gebildet und zurueckgegeben. Ein
  # abgebrochener Upload faellt damit sofort auf, statt als vermeintliche
  # Sicherung liegenzubleiben — dieselbe Lehre wie beim Dump selbst.
  local remote_sum
  remote_sum="$(kubectl run "$podname" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"mkdir -p $REMOTE_DIR && cat > $target && sha256sum $target | cut -d\\\" \\\" -f1\"" "$podname")" \
    < "$tmp.enc" 2>/dev/null | tr -d "\r" | tail -1)"

  if [[ "$remote_sum" != "$local_sum" ]]; then
    echo "FATAL: Pruefsumme nach der Uebertragung weicht ab." >&2
    echo "  lokal:  $local_sum" >&2
    echo "  auf fleet: ${remote_sum:-<leer>}" >&2
    return 1
  fi
  echo "Pruefsumme bestaetigt: ${local_sum:0:16}…"

  cmd_prune
  echo "Sicherung abgelegt: $target"
}

cmd_prune() {
  local cmd="find $REMOTE_DIR -maxdepth 1 -type f -name 'tickets-*.dump.enc' -mtime +$RETENTION_DAYS -print -delete"
  if $DRY_RUN; then echo "[dry-run] $cmd"; return 0; fi
  kubectl run "sdlc-backup-prune-$(date -u +%s)" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm --quiet \
    --overrides="$(_helper_overrides "\"$cmd\"")" >/dev/null 2>&1 || true
}

cmd_list() {
  local listname="sdlc-backup-list-$(date -u +%s)"
  kubectl run "$listname" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"ls -lh $REMOTE_DIR 2>/dev/null || echo '(noch keine Sicherung)'\"" "$listname")" < /dev/null
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

  # Den Dateinamen VORHER ermitteln und als festen Pfad uebergeben. Ihn im
  # Container per $(ls …) zu bestimmen bedeutete, eine Kommandosubstitution
  # durch Heredoc, JSON und zwei Shells zu escapen — das brach als
  # "Invalid JSON Patch", ohne zu verraten, an welcher Stelle.
  local lsname="sdlc-restore-ls-$(date -u +%s)"
  local latest
  latest="$(kubectl run "$lsname" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"ls -1t $REMOTE_DIR/tickets-*.dump.enc 2>/dev/null | head -1\"" "$lsname")" \
    < /dev/null 2>/dev/null | tr -d '\r' | head -1)"
  [[ -n "$latest" ]] || { echo "ERROR: keine Sicherung auf fleet gefunden" >&2; return 1; }
  echo "Juengste Sicherung: $latest"

  local fetchname="sdlc-restore-fetch-$(date -u +%s)"
  kubectl run "$fetchname" \
    -n "$DST_NS" --context "$DST_CTX" \
    --image="$HELPER_IMAGE" --restart=Never --rm -i --quiet \
    --overrides="$(_helper_overrides "\"cat $latest\"" "$fetchname")" \
    < /dev/null > "$tmp"

  [[ -s "$tmp" ]] || { echo "ERROR: heruntergeladene Datei ist leer — Download fehlgeschlagen" >&2; return 1; }

  # [T002727] Integritätsprüfung: ein kubectl-attach-Download eines
  # Binärstroms kann verstümmelt ankommen (z.B. Log-Prefixe, Trunkierung
  # durch Container-Log-Streaming). Prüfe vor der Entschlüsselung:
  #   1. Die Datei muss eine sinnvolle Mindestgröße haben (< 100 Bytes ist
  #      garantiert kein gültiger pg_dump).
  #   2. Die Entschlüsselung muss erfolgreich sein — openssl gibt bei
  #      korrupten Daten einen nicht-null Exit-Code.
  local fsize; fsize="$(wc -c < "$tmp" | tr -d ' ')"
  if [[ "$fsize" -lt 100 ]]; then
    echo "ERROR: Download mutmaßlich beschädigt — nur $fsize bytes empfangen (erwartet >100)" >&2
    return 1
  fi

  openssl enc -d -aes-256-cbc -pbkdf2 -in "$tmp" -out "$tmp.dump" -pass env:SDLC_BACKUP_PASS || {
    echo "ERROR: Entschluesselung fehlgeschlagen — Download vermutlich korrupt (kubectl-attach-Problem, T002727)" >&2
    return 1
  }

  # Die Wegwerf-DB legt der Superuser an: die website-Rolle traegt kein
  # CREATEDB ("permission denied to create database"). Eigentuemer wird
  # trotzdem website, damit der Restore ohne Rechteproblem durchlaeuft.
  local checkdb="sdlc_restore_check"
  local pod; pod="$(_pod "$SRC_CTX" "$SRC_NS")"
  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $checkdb" -c "CREATE DATABASE $checkdb OWNER $DB_USER"

  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    pg_restore -U "$DB_USER" -d "$checkdb" --no-owner --no-privileges < "$tmp.dump" >/dev/null 2>&1 || true

  echo "== Zeilen in der wiederhergestellten Kopie =="
  local counts
  counts="$(kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U "$DB_USER" -d "$checkdb" -qtA -c \
    "SELECT relname || '|' || n_live_tup FROM pg_stat_user_tables WHERE schemaname='tickets' ORDER BY relname" 2>/dev/null)"
  printf '%s\n' "$counts" | sed 's/^/  /'

  kubectl exec -i "$pod" -n "$SRC_NS" --context "$SRC_CTX" -c postgres -- \
    psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $checkdb" >/dev/null

  # Ein leeres Ergebnis ist KEIN bestandener Nachweis. Ohne diesen Riegel
  # meldete der Befehl "abgeschlossen", obwohl der Download leer war und gar
  # nichts eingespielt wurde — ein vakuos gruener Test ist schlimmer als
  # keiner, weil er Sicherheit vortaeuscht (vgl. T002356-M1).
  if [[ -z "${counts//[[:space:]]/}" ]]; then
    echo "FEHLER: die wiederhergestellte Kopie ist leer — der Nachweis ist NICHT erbracht." >&2
    echo "        Ursache pruefen: kam die Datei vollstaendig an? (kubectl-Attach-Problem)" >&2
    return 1
  fi
  echo "Restore-Nachweis erbracht (Wegwerf-DB wieder entfernt)."
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
