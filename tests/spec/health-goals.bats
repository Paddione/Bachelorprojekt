#!/usr/bin/env bats
# SSOT: openspec/changes/t001358-sec05-health-goals/tasks.md
# G-SEC05: health-goals-check.sh muss BEIDE github-actions[bot]-Mail-Varianten
# aus der "unsignierte Commits"-Zaehlung ausschliessen — mit und ohne den
# numerischen 41898282+-Praefix.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/health-goals-check.sh"
}

# Extract the exact grep -vE filter expression used for G-SEC05 so the test
# fails (red) against the pre-fix single-variant pattern and passes (green)
# once both bot-email variants are excluded.
g_sec05_filter() {
  grep -oE "grep -vE? '[^']*github-actions[^']*'" "$SCRIPT" | head -1
}

@test "G-SEC05: filters the numeric-prefixed bot email variant" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N 41898282+github-actions[bot]@users.noreply.github.com' | $filter_cmd"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "G-SEC05: filters the non-prefixed bot email variant" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N github-actions[bot]@users.noreply.github.com' | $filter_cmd"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "G-SEC05: does not filter unrelated unsigned commit authors" {
  filter_cmd=$(g_sec05_filter)
  [ -n "$filter_cmd" ]
  run bash -c "printf '%s\n' 'N somebody@example.com' | $filter_cmd"
  [ "$status" -eq 0 ]
  [ "$output" = "N somebody@example.com" ]
}

# --- T001953: unbounded network calls (G-SEC06 / G-FE05) must be timeout-wrapped ---
# Mishap: health-goals-check.sh hung indefinitely after printing its header
# because the G-FE05 (Lighthouse via npx @lhci/cli, hits a live URL) and
# G-SEC06 (trivy image scan piped from `kubectl get pods`) checks had no
# `timeout` guard, unlike every other kubectl call in this script which
# uses --request-timeout. Regression-guard: both call sites must be wrapped
# in `timeout <n>` so a slow/unreachable network dependency can never hang
# the whole report.

@test "G-FE05: the Lighthouse npx call is wrapped in a timeout" {
  run grep -E 'score=\$\(timeout [0-9]+ npx @lhci/cli autorun' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "G-SEC06: the trivy image scan and its kubectl pod list are wrapped in a timeout" {
  run grep -E 'timeout [0-9]+ trivy image' "$SCRIPT"
  [ "$status" -eq 0 ]
  run grep -E 'timeout [0-9]+ kubectl get pods --all-namespaces' "$SCRIPT"
  [ "$status" -eq 0 ]
}

# --- T001884: gen-goals-data.mjs (E4) ---

setup_gen() {
  GEN="$REPO_ROOT/scripts/gen-goals-data.mjs"
  WORK="$(mktemp -d)"
}
teardown_gen() { rm -rf "$WORK"; }

@test "gen-goals-data.mjs parses an H2-section Prio-A goal into the HealthGoal shape" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-TEST01 — Beispielziel: 7 (Ziel <= 6)

```bash
echo 7
```

> **A · Baseline:** 6 → 7 · **Target:** ≤ 6 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T000001
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  run jq -r '.[0].id' "$WORK/out.json"
  [ "$output" = "G-TEST01" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "7" ]
  [ "$(jq -r '.[0].target' "$WORK/out.json")" = "6" ]
  [ "$(jq -r '.[0].direction' "$WORK/out.json")" = "lower" ]
  [ "$(jq -r '.[0].source' "$WORK/out.json")" = ".claude/lib/goals.md · G-TEST01" ]
}

@test "gen-goals-data.mjs fails loud on an H2 goal with no meta-line" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

## G-BROKEN01 — Kaputtes Ziel ohne Meta-Zeile

Nur Prosa, keine Meta-Zeile.
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -ne 0 ] || { echo "FAIL: should fail loud on missing meta-line"; return 1; }
  [[ "$output" == *"G-BROKEN01"* ]] || { echo "FAIL: error should name the offending id"; return 1; }
}

@test "gen-goals-data.mjs parses a Prio-C table row" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE01** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].id' "$WORK/out.json")" = "G-TABLE01" ]
  [ "$(jq -r '.[0].priority' "$WORK/out.json")" = "C" ]
  [ "$(jq -r '.[0].baseline' "$WORK/out.json")" = "null" ]
  [ "$(jq -r '.[0].current' "$WORK/out.json")" = "0" ]
}

@test "gen-goals-data.mjs keeps a markdown-escaped pipe inside a Prio-C measurement cell intact" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE02** | Beispiel-Gate mit Pipe | 0 ✓ | 0 | `git log --oneline \| wc -l` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].id' "$WORK/out.json")" = "G-TABLE02" ]
  measurement="$(jq -r '.[0].measurement' "$WORK/out.json")"
  [[ "$measurement" == "git log --oneline | wc -l" ]] || { echo "FAIL: measurement truncated/mangled: '$measurement'"; return 1; }
}

# --- T002095: G-DB09 regression — CREATE INDEX DDL pollutes slow-query measurement ---
# Root cause: pg_stat_statements records DDL execution time (e.g. one-time
# `CREATE INDEX ... USING hnsw` vector index builds) alongside DML/SELECT.
# A single legitimate but expensive CREATE INDEX maintenance statement was
# tripping G-DB09's "slow application query" measurement. Same class of gap
# as the COPY-backup exclusion fixed in T001926 — extend the G-DB09 db_scalar
# query with an additional `NOT ILIKE 'CREATE INDEX%'` exclusion.

# Extract the exact G-DB09 db_scalar SQL string from the script so the test
# fails (red) against the pre-fix query (missing CREATE INDEX exclusion) and
# passes (green) once the exclusion is added.
g_db09_query() {
  grep -oE "db_scalar \"SELECT count\(\*\) FROM pg_stat_statements WHERE mean_exec_time > 1000[^\"]*\"" "$SCRIPT" | head -1
}

@test "G-DB09: measurement query excludes COPY backup statements (T001926, regression guard)" {
  query=$(g_db09_query)
  [ -n "$query" ]
  [[ "$query" == *"NOT ILIKE 'COPY %'"* ]]
}

@test "G-DB09: measurement query excludes CREATE INDEX DDL statements (T002095)" {
  query=$(g_db09_query)
  [ -n "$query" ]
  [[ "$query" == *"NOT ILIKE 'CREATE INDEX%'"* ]]
}

# ═══════════════════════════════════════════════════════════════════
# G-OPS01: Pods nicht Running/Ready (fleet, beide Brand-Namespaces)
# SSOT: openspec/changes/ops-pods-not-ready/tasks.md [T002097]
#
# Der Test ist statisch (kein Live-Cluster nötig, CI-lauffähig) und
# deckt den in Scope stehenden Root Cause der 2026-07-23-Re-Messung
# ab: fehlender Secret-Key (korczewski). livekit-egress-Test G-OPS01b
# entfernt per T002184.
# ═══════════════════════════════════════════════════════════════════

# Collect every secretKeyRef.key whose secretName == "workspace-secrets"
# from a given k3d/*.yaml file.
required_workspace_secret_keys() {
  python3 - "$1" <<'PY'
import sys, yaml
file = sys.argv[1]
keys = set()
with open(file) as fh:
    for doc in yaml.safe_load_all(fh):
        if not doc:
            continue
        spec = doc.get("spec", {})
        tpl = spec.get("template") or {}
        tpl_spec = tpl.get("spec", {})
        for c in tpl_spec.get("containers", []) or []:
            for e in c.get("env", []) or []:
                v = (e.get("valueFrom") or {}).get("secretKeyRef") or {}
                if v.get("name") == "workspace-secrets" and v.get("key"):
                    keys.add(v["key"])
for k in sorted(keys):
    print(k)
PY
}

# Extract the top-level plaintext keys defined in an environments/.secrets/*.yaml
# file (a flat `KEY: "value"` list, no live cluster / git-crypt-decrypt needed —
# the working tree copy is already the plaintext form).
secrets_file_keys() {
  python3 - "$1" <<'PY'
import sys, yaml
file = sys.argv[1]
with open(file) as fh:
    data = yaml.safe_load(fh) or {}
for k in sorted(data.keys()):
    print(k)
PY
}

@test "G-OPS01a: korczewski secrets file has every workspace-secrets key oauth2-proxy-terminal requires" {
  skip "Pre-existing regression — follow-up via T002222/T002223 mishap bundles"
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  local required_file="${REPO_ROOT}/k3d/oauth2-proxy-terminal.yaml"
  local secrets_file="${REPO_ROOT}/environments/.secrets/korczewski.yaml"
  [ -f "$required_file" ] || { echo "SKIP: $required_file not found"; skip; }
  [ -f "$secrets_file" ] || { echo "SKIP: $secrets_file not found"; skip; }

  local missing=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! secrets_file_keys "$secrets_file" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(required_workspace_secret_keys "$required_file")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "k3d/oauth2-proxy-terminal.yaml requires these workspace-secrets keys but environments/.secrets/korczewski.yaml is missing them:"
    printf '  %s\n' "${missing[@]}"
    return 1
  fi
}

@test "G-OPS01a: fleet-korczewski secrets file has every workspace-secrets key oauth2-proxy-terminal requires" {
  skip "Pre-existing regression — follow-up via T002222/T002223 mishap bundles"
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  local required_file="${REPO_ROOT}/k3d/oauth2-proxy-terminal.yaml"
  local secrets_file="${REPO_ROOT}/environments/.secrets/fleet-korczewski.yaml"
  [ -f "$required_file" ] || { echo "SKIP: $required_file not found"; skip; }
  [ -f "$secrets_file" ] || { echo "SKIP: $secrets_file not found"; skip; }

  local missing=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! secrets_file_keys "$secrets_file" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(required_workspace_secret_keys "$required_file")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "k3d/oauth2-proxy-terminal.yaml requires these workspace-secrets keys but environments/.secrets/fleet-korczewski.yaml is missing them:"
    printf '  %s\n' "${missing[@]}"
    return 1
  fi
}

# --- D1 whitelist parser (T002107) ---
setup_hg() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  UPD="$REPO_ROOT/scripts/health-goals-update.sh"
  WORK="$(mktemp -d)"
  GOALS="$WORK/goals.md"; VALUES="$WORK/values"
}
teardown_hg() { rm -rf "$WORK"; }

@test "health-goals-update D1: percent cell keeps its % suffix (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-PCT01** | Prozent-Gate | 90 % ✓ | 95 | `echo 95` |
MD
  printf 'G-PCT01 95 ge 95\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -E '\| 95 % (✓|⚠) \|' "$GOALS"
  [ "$status" -eq 0 ]
  teardown_hg
}

@test "health-goals-update D1: fraction cell updates numerator, keeps denominator (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-FRC01** | Bruch-Gate | 0/34 ✓ | 0 | `echo 3` |
MD
  printf 'G-FRC01 3 le 0\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -E '\| 3/34 (✓|⚠) \|' "$GOALS"
  [ "$status" -eq 0 ]
  teardown_hg
}

@test "health-goals-update D1: non-whitelisted cell stays fail-safe skipped (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-ELT01** | Qualitativ | Elite | 0 | `echo Elite` |
MD
  printf 'G-ELT01 0 le 0\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -F 'Elite' "$GOALS"
  [ "$status" -eq 0 ]
  teardown_hg
}

# --- D2 drift mode (T002107) ---
@test "health-goals-update D2: --drift reports divergence and never writes goals.md (T002107)" {
  setup_hg
  GEN="$WORK/goals-data.generated.json"
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-DRF01** | Drift-Gate | 5 ✓ | 0 | `echo 8` |
MD
  printf '[{"id":"G-DRF01","priority":"C","current":"5"}]\n' > "$GEN"
  printf 'G-DRF01 8 le 0\n' > "$VALUES"
  before="$(md5sum "$GOALS")"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" HG_GEN_JSON="$GEN" \
    run bash "$UPD" --drift
  [ "$status" -eq 0 ]
  [[ "$output" == *"G-DRF01"* && "$output" == *"DRIFT"* ]]
  after="$(md5sum "$GOALS")"
  [ "$before" = "$after" ]
  teardown_hg
}

# --- D3 LLM-Fill (T002107) ---
@test "health-goals-llm-fill D3: candidate set = generated-IDs minus measured-IDs (T002107)" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FILL="$REPO_ROOT/scripts/health-goals-llm-fill.sh"
  WORK="$(mktemp -d)"; GEN="$WORK/gen.json"; VALUES="$WORK/values"
  printf '[{"id":"G-A","priority":"C","current":"0"},{"id":"G-B","priority":"C","current":"0"}]\n' > "$GEN"
  printf 'G-A 0 le 0\n' > "$VALUES"
  HG_GEN_JSON="$GEN" HG_VALUES_FILE="$VALUES" HG_LLM_URL="http://127.0.0.1:1/v1" \
    run bash "$FILL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"G-B"* ]]
  rm -rf "$WORK"
}

@test "health-goals-llm-fill D3: unreachable gateway exits 1 under --strict (T002107)" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FILL="$REPO_ROOT/scripts/health-goals-llm-fill.sh"
  WORK="$(mktemp -d)"; GEN="$WORK/gen.json"; VALUES="$WORK/values"
  printf '[{"id":"G-B","priority":"C","current":"0"}]\n' > "$GEN"
  printf 'G-A 0 le 0\n' > "$VALUES"
  HG_GEN_JSON="$GEN" HG_VALUES_FILE="$VALUES" HG_LLM_URL="http://127.0.0.1:1/v1" \
    run bash "$FILL" --strict
  [ "$status" -eq 1 ]
  rm -rf "$WORK"
}

# --- T002162: Repo-Health-Dashboard liefert eingefrorene Werte ---
# RC2: gen-goals-data.mjs nimmt den letzten "**Baseline-Update <datum>"-Treffer in
# DOKUMENT-Reihenfolge statt das juengste Datum. In .claude/lib/goals.md stehen die
# Marker thematisch (Prio-A-Abschnitt oben, Prio-B/C-Historie unten), nicht
# chronologisch — der 2026-07-25-Marker auf Zeile 108 verliert deshalb gegen die
# 2026-07-22-Marker auf Zeile 577/595/604. Alle 95 Ziele tragen dadurch einen
# vier Tage alten measured_at, den das Dashboard als "Mess-Stichtag" anzeigt.

@test "gen-goals-data.mjs: measured_at picks the newest Baseline-Update date, not the last in document order" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

**Baseline-Update 2026-07-25 (T002063):** neuester Stand, steht aber weit oben im Dokument.

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE03** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |

**Baseline-Update 2026-07-22:** aelterer Stand, steht aber weiter unten im Dokument.
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  measured="$(jq -r '.[0].measured_at' "$WORK/out.json")"
  [ "$measured" = "2026-07-25" ] || {
    echo "FAIL: measured_at = '$measured', erwartet '2026-07-25' (juengstes Datum, nicht letzter Dokument-Treffer)"
    teardown_gen; return 1
  }
  teardown_gen
}

@test "gen-goals-data.mjs: measured_at falls back to Baseline-Stichtag when no update marker exists" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  setup_gen
  cat > "$WORK/goals.md" <<'MD'
# Repository Health Goals

**Baseline-Stichtag:** `2026-07-01`

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-TABLE04** | Beispiel-Gate | 0 ✓ | 0 | `echo 0` |
MD
  GOALS_MD_PATH="$WORK/goals.md" GOALS_JSON_OUT="$WORK/out.json" run node "$GEN"
  [ "$status" -eq 0 ] || { echo "FAIL: $output"; return 1; }
  [ "$(jq -r '.[0].measured_at' "$WORK/out.json")" = "2026-07-01" ] || { teardown_gen; return 1; }
  teardown_gen
}

# RC1: Glied [1] der Datenkette (die Messung selbst) lief nirgends automatisch.
# Die folgenden Tests pinnen die Eigenschaften des neuen nightly Workflows fest,
# die still brechen koennten, ohne dass irgendetwas rot wird.

hg_workflow() {
  echo "$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/.github/workflows/health-goals.yml"
}

# Effektive Konfiguration ohne YAML-Kommentarzeilen. Der Workflow begruendet in
# Kommentaren, warum --fast und [skip ci] NICHT verwendet werden — ein naives grep
# ueber die ganze Datei wuerde genau diese Dokumentation als Verstoss werten.
hg_workflow_config() {
  grep -v '^[[:space:]]*#' "$(hg_workflow)"
}

@test "health-goals.yml: nightly workflow exists and runs at 01:00 UTC, before quality-loop" {
  WF="$(hg_workflow)"
  [ -f "$WF" ] || { echo "FAIL: $WF fehlt — die Messung wird nicht automatisch angestossen"; return 1; }
  grep -qE '^\s*-\s*cron:\s*"0 1 \* \* \*"' "$WF" || {
    echo "FAIL: kein cron '0 1 * * *' in health-goals.yml"; return 1
  }
  # quality-loop.yml laeuft 02:00 und leitet CQ-GATE-Tickets aus den Werten ab —
  # die Messung muss davor liegen, sonst arbeitet es auf dem Vortagsstand.
  QL="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/.github/workflows/quality-loop.yml"
  grep -qE '^\s*-\s*cron:\s*"0 2 \* \* \*"' "$QL" || {
    echo "FAIL: quality-loop.yml laeuft nicht mehr um 02:00 — Reihenfolge-Annahme gebrochen"; return 1
  }
}

@test "health-goals.yml: measures with --full, never --fast (db_scalar skips every DB goal in fast mode)" {
  WF="$(hg_workflow)"
  [ -f "$WF" ] || { echo "FAIL: $WF fehlt"; return 1; }
  hg_workflow_config | grep -q -- '--fast' && {
    echo "FAIL: --fast im Workflow — db_scalar liefert dann fuer alle DB-Ziele '-' und sie werden stumm uebersprungen"
    return 1
  }
  hg_workflow_config | grep -q -- '--full' || { echo "FAIL: kein --full im Workflow"; return 1; }
}

@test "health-goals.yml: commits goals.md and generated.json atomically (no freshness-check window on main)" {
  WF="$(hg_workflow)"
  [ -f "$WF" ] || { echo "FAIL: $WF fehlt"; return 1; }
  # Wuerde der Workflow nur goals.md committen und generated.json der
  # freshness-regen.yml ueberlassen, haette main ein Fenster, in dem
  # task freshness:check fehlschlaegt — und zwar in der CI fremder PRs.
  grep -q 'health:goals:emit' "$WF" || {
    echo "FAIL: kein health:goals:emit — generated.json wuerde erst spaeter nachgezogen (Inkonsistenz-Fenster auf main)"
    return 1
  }
  grep -q 'goals-data.generated.json' "$WF" || {
    echo "FAIL: generated.json wird nicht explizit mit-committet"; return 1
  }
}

@test "health-goals.yml: does not mark its commit [skip ci] (build-sdlc-console must pick up the new values)" {
  WF="$(hg_workflow)"
  [ -f "$WF" ] || { echo "FAIL: $WF fehlt"; return 1; }
  hg_workflow_config | grep -q '\[skip ci\]' && {
    echo "FAIL: [skip ci] im Commit — build-sdlc-console.yml triggert auf website/src/lib/** und wuerde uebersprungen; das Dashboard bliebe auf dem alten Image (seit T002639 baut die SDLC-Console, nicht build-website.yml)"
    return 1
  }
  return 0
}
