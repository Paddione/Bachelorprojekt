#!/usr/bin/env bats
# tests/spec/software-factory/readiness-gate-before-launch.bats
# SSOT: openspec/specs/software-factory.md — Requirement "Factory Readiness Check"
#
# [T003773] Pruefmodus: OUTPUT-Verifikation (T002448-M4). Der Test FUEHRT
# dispatcher-bridge.sh mit --dry-run gegen ein synthetisches Prep-File AUS und
# prueft dessen stderr-Zeilen — er greppt NICHT die Quelldatei. Grund: der Defekt
# war ein fehlender Aufrufer, kein fehlender Code. `grep -q readiness-check
# dispatcher-bridge.sh` waere gruen geworden, sobald irgendwo das Wort steht,
# auch ohne dass der Guard je die Launch-Entscheidung beeinflusst.
#
# Der Defekt: scripts/factory/readiness-check.sh implementiert das Requirement
# "verify that the target branch exists on origin and that the plan file is
# present on that branch" vollstaendig (inkl. der Behandlung des Literalstrings
# "null"), hatte aber ausserhalb von tests/unit/factory-readiness.bats KEINEN
# Aufrufer. Planlose Tickets liefen deshalb mit branch/plan_path="null" in den
# Executor; dispatcher-bridge.sh:126 faellt bei worktree_path="null" auf den
# HAUPT-CHECKOUT zurueck, wo der Agent am 2026-08-11 einen fremden Branch
# rebasete und umbenannte (git reflog, T003773).

load '_sf_common'

REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
BRIDGE="${REPO_ROOT}/scripts/factory/dispatcher-bridge.sh"

# Lokales git-Fixture statt des echten `origin` [T003773].
#
# Der erste Entwurf pruefte gegen `origin/main` + CLAUDE.md des echten Repos.
# Lokal gruen, in CI rot: der Actions-Checkout ist flach, `git show
# origin/main:CLAUDE.md` schlaegt dort fehl, und damit galt AUCH der gueltige
# Fall als "nicht ready" — der Test mass die Ausstattung des Runners statt den
# Zustand des Codes (dev-flow-plan/T002820). Muster uebernommen aus
# tests/unit/factory-readiness.bats, das denselben Guard schon so testet.
setup() {
  _sf_setup
  WORK="$(mktemp -d "${BATS_TEST_TMPDIR:-/tmp}/readiness-gate.XXXXXX")"
  BARE="$WORK/origin.git"
  CLONE="$WORK/clone"
  git init --quiet --bare "$BARE"
  git clone --quiet "$BARE" "$CLONE"
  (
    cd "$CLONE"
    git config user.email t@t.test
    git config user.name test
    mkdir -p openspec/changes/demo
    echo "# demo plan" > openspec/changes/demo/tasks.md
    git add -A
    git commit --quiet -m "add plan"
    git branch -M main
    git push --quiet -u origin main
  )
  PLAN_ON_BRANCH="openspec/changes/demo/tasks.md"
}

teardown() { rm -rf "${WORK:-}"; _sf_teardown; }

# Fuehrt die Bridge im Fixture-Klon aus: der Guard fragt `git ls-remote origin`
# und `git show origin/<branch>:<plan>` im CWD, greift also aufs Fixture. Das
# Skript selbst kommt per absolutem Pfad aus dem echten Repo.
_run_bridge() { # <prep_file>
  run timeout 120 bash -c "cd '$CLONE' && bash '$BRIDGE' '$1' --dry-run 2>&1"
}

# Baut ein Prep-File mit genau einer launch-Zeile.
_prep_file() { # <ext_id> <branch> <plan_path> <worktree_path>
  local f="${BATS_TEST_TMPDIR}/prep-${1}.json"
  jq -cn --arg e "$1" --arg br "$2" --arg p "$3" --arg w "$4" \
    '{launch:[{brand:"mentolder",external_id:$e,slot:1,title:"t",
               branch:$br,plan_path:$p,worktree_path:$w,
               dry_run:true,attempt:1,model_tier:"flash"}],skipped:[]}' > "$f"
  printf '%s' "$f"
}

# ── Positiv-Anker (T002356-M1) ──────────────────────────────────#
# MUSS vor der Negativ-Aussage stehen: ohne ihn bestuende der Test unten auch
# dann, wenn dispatcher-bridge.sh ueberhaupt nichts mehr launcht.
@test "T003773: Launch-Zeile mit existierendem Branch UND Plan wird gelauncht" {
  local f; f="$(_prep_file T-READY main "$PLAN_ON_BRANCH" /tmp)"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF "would launch pipeline for T-READY"
}

# ── Negativ-Aussage ─────────────────────────────────────────────#
@test "T003773: planlose Launch-Zeile (branch/plan_path=\"null\") wird NICHT gelauncht" {
  local f; f="$(_prep_file T-NOPLAN null null null)"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  # Kein Launch — weder echt noch als Dry-Run-Ankuendigung.
  ! echo "$output" | grep -qF "would launch pipeline for T-NOPLAN"
  ! echo "$output" | grep -qF "launching pipeline for T-NOPLAN"
}

@test "T003773: der Skip nennt den Readiness-Grund, statt still zu verschwinden" {
  local f; f="$(_prep_file T-NOPLAN2 null null null)"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  # Ein stiller Skip ist der Defekt, den T003269 fuer die Prep-Datei schon
  # einmal behoben hat: das Fliessband stand wochenlang ohne Fehlermeldung.
  echo "$output" | grep -qF "T-NOPLAN2"
  echo "$output" | grep -qE "not ready|missing_args|no_plan|readiness"
}

# ── Zweite Verteidigungslinie: opencode-exec.sh ─────────────────#
# OPENCODE_BIN wird auf /bin/true gestubbt: fehlt der Guard, startet das Skript
# sonst einen echten Orchestrator-Lauf aus der Testsuite heraus.
EXEC="${REPO_ROOT}/scripts/factory/opencode-exec.sh"

# Verankert an EXIT-CODES, nicht am Wortlaut der Meldungen (T002716): Exit 6 =
# der Orchestrator lief und wurde erst HINTERHER als blocked bewertet (kein
# Commit, T003335); Exit 7 = wegen fehlendem Branch/Plan gar nicht erst gestartet.
# Exit 2 waere nicht brauchbar — den belegt bereits "opencode-Binary nicht
# gefunden" (T003275), beide Faelle waeren im Journal ununterscheidbar.
@test "T003773: opencode-exec startet den Lauf, wenn Branch und Plan gesetzt sind" {
  # Positiv-Anker: Exit 6 belegt, dass der Lauf ERREICHT wurde. Ohne ihn bestuende
  # der Negativtest unten auch bei einem generell kaputten Skript.
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-OK "$BATS_TEST_TMPDIR" main "$PLAN_ON_BRANCH"
  [ "$status" -eq 6 ]
}

@test "T003773: opencode-exec bricht ohne Branch/Plan ab, statt im Haupt-Checkout zu laufen" {
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-NOPLAN "$BATS_TEST_TMPDIR" null null
  [ "$status" -eq 7 ]
  echo "$output" | grep -qiE "ohne Branch/Plan|no_plan"
}

@test "T003773: ein Branch ohne die Plan-Datei wird als no_plan_on_branch abgelehnt" {
  local f; f="$(_prep_file T-GHOSTPLAN main "openspec/changes/gibt-es-nicht-T003773/tasks.md" /tmp)"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -qF "would launch pipeline for T-GHOSTPLAN"
}
