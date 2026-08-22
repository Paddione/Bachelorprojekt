#!/usr/bin/env bats
# tests/spec/backup-pipeline/filen-remote-retention.bats
# SSOT: openspec/specs/backup-pipeline.md — Requirement "Remote-Retention auf Filen"
# Ticket: T013300
#
# Prüfmodus (MIXED):
#  - Strukturelle Assertions greppen die CronJob-Manifeste. Das ist hier die
#    angemessene Form (Querschnittstest, dessen Ergebnis sich ausschließlich im
#    Manifest-Quelltext manifestiert — wie tests/unit/manifests.bats).
#  - Die funktionalen Tests extrahieren den Retention-Block aus dem Manifest und
#    führen ihn gegen einen gestubbten `filen`-CLI-Command aus (Output-Verifikation:
#    gemessen wird der tatsächliche Delete-Satz und der Exit-Code, nicht Quelltext).

load '../test_helper'

REPO_ROOT="${PROJECT_DIR}"
DB_MANIFEST="${REPO_ROOT}/k3d/backup-cronjob.yaml"
PVC_MANIFEST="${REPO_ROOT}/k3d/pvc-backup-cronjob.yaml"

# ── Struktur: Retention-Block in beiden filen-upload Sidecars ──────────

@test "db-backup filen-upload contains the remote retention block" {
  run grep -c 'Remote retention \[T013300\]' "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'rm -y' "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "pvc-backup filen-upload contains the remote retention block" {
  run grep -c 'Remote retention \[T013300\]' "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'rm -y' "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "retention keeps at most 14 generations by default in both manifests" {
  # Akzeptanz T013300: nach 14 Tagen Lauf sind remote ≤15 Generationen je Pfad.
  run grep -c 'FILEN_REMOTE_RETENTION:-14' "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'FILEN_REMOTE_RETENTION:-14' "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "deletions are guarded by the strict generation-name regex in both manifests" {
  # Safety-Interlock: nur YYYYMMDD-HHMMSS / pvc-YYYYMMDD-HHMMSS darf gelöscht werden.
  # -F (Fixed String): ^/$ im Muster sind Teil des eingebetteten Shell-Regex,
  # nicht Zeilenanker des greps (T003108-Familie).
  local regex='^(pvc-)?[0-9]{8}-[0-9]{6}$'
  run grep -cF "$regex" "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -cF "$regex" "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "retention uses soft-delete only — no hanging trash commands are invoked" {
  # Positiv-Anker: rm -y ist der Löschpfad (in beiden Dateien vorhanden).
  grep -q 'rm -y' "$DB_MANIFEST"
  grep -q 'rm -y' "$PVC_MANIFEST"
  # Negativ-Aussage: trash-empty/trash-delete hängen in CLI 0.0.39 [T013037] —
  # sie dürfen nirgends als Kommando-Aufruf vorkommen (Kommentarzeilen ausgenommen).
  local violations
  violations=$(grep -v '^\s*#' "$DB_MANIFEST" "$PVC_MANIFEST" | grep -cE 'filen .*trash-(empty|delete)' || true)
  [ "$violations" -eq 0 ]
}

@test "every retention filen call is timeout-wrapped and hang-protected" {
  for f in "$DB_MANIFEST" "$PVC_MANIFEST"; do
    run grep -c 'timeout 120 filen --skip-update --no-autocomplete' "$f"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
    run grep -c 'timeout 90 filen --skip-update --no-autocomplete' "$f"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done
}

@test "retention throttles deletions against the login rate limit" {
  # ~30 Logins/min Limit: sleep 3 zwischen rm-Aufrufen.
  run grep -c 'sleep 3' "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c 'sleep 3' "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "prune failure exits non-zero instead of being swallowed silently" {
  # Beide Anker als Fixed Strings (BRE-\| wäre Alternation und würde den
  # bereits existierenden Upload-exit-1 falsch-matchen — vakuoser Pass).
  for f in "$DB_MANIFEST" "$PVC_MANIFEST"; do
    run grep -cF 'PRUNE_FAILED' "$f"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
    run grep -cF '" -eq 0 ] || exit 1' "$f"
    [ "$status" -eq 0 ]
    [ "$output" -ge 1 ]
  done
}

@test "@filen/cli is pinned to the proven 0.0.39 in both manifests" {
  # Die Retention hängt am ls/rm-Verhalten dieser Version — Pin erzwingt bewusste Upgrades.
  run grep -c 'npm install -g @filen/cli@0.0.39' "$DB_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
  run grep -c 'npm install -g @filen/cli@0.0.39' "$PVC_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
}

# ── Funktional: Block gegen Stub-CLI ausführen ─────────────────────────

# Extrahiert den Retention-Block aus dem db-backup-Manifest und rendert die
# Deploy-Escaping-Stufe ($${VAR} → ${VAR}) wie scripts/flux-render-artifact.sh.
extract_db_retention_block() {
  python3 - "$1" <<'PY'
import sys, yaml, re
path = sys.argv[1]
with open(path) as f:
    docs = list(yaml.safe_load_all(f))
cron = [d for d in docs if d and d.get('kind') == 'CronJob'][0]
c = cron['spec']['jobTemplate']['spec']['template']['spec']['containers'][1]
assert c['name'] == 'filen-upload', f"container[1] is {c['name']}"
s = c['args'][0].replace('$$', '$')
m = re.search(r'(# ── Remote retention.*?)$', s, re.S)
if not m:
    sys.exit(3)
sys.stdout.write(m.group(1))
PY
}

setup_functional() {
  REPO_ROOT="${PROJECT_DIR}"
  BLOCK="$(mktemp /tmp/t013300-block.XXXXXX.sh)"
  STUB_DIR="$(mktemp -d /tmp/t013300-stub.XXXXXX)"
  CALLS="$STUB_DIR/calls.log"
  extract_db_retention_block "$DB_MANIFEST" > "$BLOCK" || {
    status=3; return 1
  }
  cat > "$STUB_DIR/filen" <<STUB
#!/bin/sh
echo "\$*" >> "$CALLS"
sub=""
for a in "\$@"; do case "\$a" in ls|rm|upload) sub="\$a"; break ;; esac; done
case "\$sub" in
  ls) printf '%s\n' "20260801-020001" "20260810-020002" "20260821-020003" \
              "pvc-20260805-030001" "pvc-20260819-031500" "not-a-generation.txt" ;;
  rm) exit 0 ;;
esac
STUB
  chmod +x "$STUB_DIR/filen"
}

teardown_functional() {
  rm -rf "$BLOCK" "$STUB_DIR"
}

@test "retention block prunes exactly the oldest generations beyond the limit (stubbed CLI)" {
  if ! command -v python3 >/dev/null 2>&1; then skip "python3 not installed"; fi
  python3 -c 'import yaml' 2>/dev/null || skip "pyyaml not installed"
  setup_functional
  export PATH="$STUB_DIR:$PATH" FILEN_EMAIL=t@e.st FILEN_PASSWORD=pw \
         UPLOAD_PATH=/Backup-test FILEN_REMOTE_RETENTION=3
  run sh "$BLOCK"
  [ "$status" -eq 0 ]
  # 5 Generationen gefunden, die 2 ältesten gelöscht, Limit 3 behalten
  [[ "$output" == *"5 Generationen gefunden"* ]]
  # Delete-Satz: exakt die zwei ältesten Stamps, in Sortierreihenfolge
  rms=$(grep -c ' rm -y /Backup-test/' "$CALLS")
  [ "$rms" -eq 2 ]
  grep -q 'rm -y /Backup-test/20260801-020001$' "$CALLS"
  grep -q 'rm -y /Backup-test/20260810-020002$' "$CALLS"
  # Fremdeinträge und die verbleibenden Generationen werden nie angerührt
  if grep -q 'not-a-generation.txt' "$CALLS"; then
    fail "stub deleted a non-generation entry"
  fi
  if grep -qE 'rm -y /Backup-test/(20260821-020003|pvc-20260805-030001|pvc-20260819-031500)$' "$CALLS"; then
    fail "stub deleted a generation inside the keep-set"
  fi
  teardown_functional
}

@test "retention block fails loudly when prune or listing fails (stubbed CLI)" {
  if ! command -v python3 >/dev/null 2>&1; then skip "python3 not installed"; fi
  python3 -c 'import yaml' 2>/dev/null || skip "pyyaml not installed"
  setup_functional
  # Stub-Variante: rm schlägt fehl → Block muss Exit 1 liefern (Failed-Job-Sichtbarkeit)
  printf '#!/bin/sh\nsub=""\nfor a in "$@"; do case "$a" in ls|rm|upload) sub="$a"; break ;; esac; done\ncase "$sub" in\n  ls) printf "%%s\\n" "20260801-020001" "20260810-020002" ;;\n  rm) exit 1 ;;\nesac\n' > "$STUB_DIR/filen"
  chmod +x "$STUB_DIR/filen"
  export PATH="$STUB_DIR:$PATH" FILEN_EMAIL=t@e.st FILEN_PASSWORD=pw \
         UPLOAD_PATH=/Backup-test FILEN_REMOTE_RETENTION=1
  run sh "$BLOCK"
  [ "$status" -eq 1 ]
  teardown_functional
}
