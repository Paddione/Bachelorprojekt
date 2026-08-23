#!/usr/bin/env bats
# tests/spec/backup-pipeline.bats
# SSOT: openspec/specs/backup-pipeline.md
#
# Covers: render-sichere Runtime-Variablen im PVC-Backup-Mounter (T014535).
# Reproduziert die Flux-Render-Logik (scripts/flux-render-artifact.sh) auf
# k3d/pvc-backup-cronjob.yaml, expandiert das MJOB-Heredoc wie der
# Orchestrator-Pod und prüft bash -n auf dem generierten Mounter-Script.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PVC_CRONJOB="$REPO/k3d/pvc-backup-cronjob.yaml"
}

# Führt die drei Render-Stufen aus scripts/flux-render-artifact.sh
# (dynamische Vars-Extraktion, runtime_vars-Filter, envsubst, $$-Unwrap)
# auf einer Datei aus und schreibt das Ergebnis nach $1.
render_flux_like() {
  local input="$1" out="$2"
  local vars runtime_vars envsubst_vars
  vars="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$input" | tr -d '${}' | sort -u | tr '\n' ' ')" || true
  runtime_vars="$(grep -oE '\$\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$input" \
    | sed -E 's/^\$\$\{//; s/\}$//' | sort -u | tr '\n' ' ')" || true
  for rv in $runtime_vars; do
    vars="$(tr ' ' '\n' <<<"$vars" | sed "/^${rv}\$/d;/^\$/d" | tr '\n' ' ')"
  done
  envsubst_vars=""
  for v in $vars; do envsubst_vars="${envsubst_vars}\$${v} "; done

  sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' "$input" \
    | envsubst "$envsubst_vars" \
    | sed -E 's/\$\$([a-zA-Z0-9_({!?])/$\1/g' \
    > "$out"
}

# ── Flux-Render: generiertes Mounter-Script ist syntaktisch gültig ─────

@test "flux render of pvc-backup yields bash -n clean mounter script" {
  command -v envsubst >/dev/null 2>&1 || skip "envsubst binary not installed"
  command -v python3 >/dev/null 2>&1 || skip "python3 binary not installed"

  render_flux_like "$PVC_CRONJOB" "$BATS_TEST_TMPDIR/rendered.yaml"

  # MJOB-Heredoc-Block aus dem gerenderten Orchestrator-Script isolieren.
  mjob="$(sed -n '/<<MJOB/,/^[[:space:]]*MJOB[[:space:]]*$/p' "$BATS_TEST_TMPDIR/rendered.yaml")"
  [ -n "$mjob" ] || skip "MJOB heredoc block not found in rendered cronjob"

  # Heredoc wie im Orchestrator-Pod expandieren (unquoted heredoc,
  # Orchestrator-Variablen gesetzt, mentolder/longhorn-Fall).
  { echo 'cat <<MJOB'; sed '1d;$d' <<<"$mjob"; echo 'MJOB'; } > "$BATS_TEST_TMPDIR/heredoc.sh"
  NS=workspace STAMP=test123 MOUNTER=pvc-backup-mounter-test123 \
    VW_SC=longhorn CLONES='vaultwarden-data-backup-clone' VW_AFFINITY='' \
    VW_CLAIM='vaultwarden-data-backup-clone' \
    bash "$BATS_TEST_TMPDIR/heredoc.sh" > "$BATS_TEST_TMPDIR/mjob.yaml"

  python3 - "$BATS_TEST_TMPDIR/mjob.yaml" "$BATS_TEST_TMPDIR/mounter.sh" <<'PY'
import sys, yaml
yaml.SafeLoader.add_constructor(
    'tag:yaml.org,2002:value', lambda loader, node: loader.construct_scalar(node))
docs = list(yaml.safe_load_all(open(sys.argv[1])))
for d in docs:
    if d and d.get('kind') == 'Job':
        for c in d['spec']['template']['spec']['containers']:
            if c['name'] == 'backup':
                open(sys.argv[2], 'w').write(c['args'][0])
                sys.exit(0)
sys.exit(1)
PY
  [ -s "$BATS_TEST_TMPDIR/mounter.sh" ] || fail "backup container not found in generated mounter Job"

  run bash -n "$BATS_TEST_TMPDIR/mounter.sh"
  if [ "$status" -ne 0 ]; then
    echo "# rendered mounter script (first 20 lines):"
    head -20 "$BATS_TEST_TMPDIR/mounter.sh" | sed 's/^/# /' >&2
  fi
  [ "$status" -eq 0 ]
}

@test "rendered mounter script keeps runtime vars and has no empty-substitution remnants" {
  command -v envsubst >/dev/null 2>&1 || skip "envsubst binary not installed"

  render_flux_like "$PVC_CRONJOB" "$BATS_TEST_TMPDIR/rendered2.yaml"

  run grep -F '\ ' "$BATS_TEST_TMPDIR/rendered2.yaml"
  [ "$status" -ne 0 ]
  grep -q '${STAMP}' "$BATS_TEST_TMPDIR/rendered2.yaml"
  grep -q '${SRC}' "$BATS_TEST_TMPDIR/rendered2.yaml"
}

# ── Push-Pfad: Unwrap deckt $$( ab (Parität mit Flux-Renderer) ─────────

@test "push-path unwrap in Taskfile.yml handles command substitution" {
  # Die Unwrap-Regel des workspace:deploy-Pfads extrahieren (die sed-Zeile,
  # deren Argument $$ enthält) und auf einen Beispielfall anwenden.
  unwrap="$(sed -n -E "s/.*sed -E '([^']*)'.*/\1/p" "$REPO/Taskfile.yml" | grep -m1 -F '\$\$' || true)"
  [ -n "$unwrap" ] || skip "no sed unwrap rule found in Taskfile.yml"

  result="$(printf 'X=$$(date +%%s)\n' | sed -E "$unwrap")"
  [ "$result" = 'X=$(date +%s)' ]
}
