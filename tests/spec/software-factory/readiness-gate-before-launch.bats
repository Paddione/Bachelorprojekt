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

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

BRIDGE="scripts/factory/dispatcher-bridge.sh"

# Baut ein Prep-File mit genau einer launch-Zeile.
_prep_file() { # <ext_id> <branch> <plan_path> <worktree_path>
  local f="${BATS_TEST_TMPDIR}/prep-${1}.json"
  jq -cn --arg e "$1" --arg br "$2" --arg p "$3" --arg w "$4" \
    '{launch:[{brand:"mentolder",external_id:$e,slot:1,title:"t",
               branch:$br,plan_path:$p,worktree_path:$w,
               dry_run:true,attempt:1,model_tier:"flash"}],skipped:[]}' > "$f"
  printf '%s' "$f"
}

# Der Guard fragt `git ls-remote origin` — ohne erreichbares origin misst der
# Test die Netzanbindung des Runners statt den Zustand des Codes (dev-flow-plan,
# T002820). Beide Faelle wuerden dann faelschlich als "nicht ready" gelten und
# der Positiv-Anker unten waere vakuos gruen.
_skip_without_origin() {
  git ls-remote --exit-code origin refs/heads/main >/dev/null 2>&1 \
    || skip "origin nicht erreichbar — Readiness-Guard nicht pruefbar"
}

# ── Positiv-Anker (T002356-M1) ──────────────────────────────────#
# MUSS vor der Negativ-Aussage stehen: ohne ihn bestuende der Test unten auch
# dann, wenn dispatcher-bridge.sh ueberhaupt nichts mehr launcht.
@test "T003773: Launch-Zeile mit existierendem Branch UND Plan wird gelauncht" {
  _skip_without_origin
  local f; f="$(_prep_file T-READY main CLAUDE.md /tmp)"

  run timeout 120 bash "$BRIDGE" "$f" --dry-run
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF "would launch pipeline for T-READY"
}

# ── Negativ-Aussage ─────────────────────────────────────────────#
@test "T003773: planlose Launch-Zeile (branch/plan_path=\"null\") wird NICHT gelauncht" {
  _skip_without_origin
  local f; f="$(_prep_file T-NOPLAN null null null)"

  run timeout 120 bash "$BRIDGE" "$f" --dry-run
  [ "$status" -eq 0 ]
  # Kein Launch — weder echt noch als Dry-Run-Ankuendigung.
  ! echo "$output" | grep -qF "would launch pipeline for T-NOPLAN"
  ! echo "$output" | grep -qF "launching pipeline for T-NOPLAN"
}

@test "T003773: der Skip nennt den Readiness-Grund, statt still zu verschwinden" {
  _skip_without_origin
  local f; f="$(_prep_file T-NOPLAN2 null null null)"

  run timeout 120 bash "$BRIDGE" "$f" --dry-run
  [ "$status" -eq 0 ]
  # Ein stiller Skip ist der Defekt, den T003269 fuer die Prep-Datei schon
  # einmal behoben hat: das Fliessband stand wochenlang ohne Fehlermeldung.
  echo "$output" | grep -qF "T-NOPLAN2"
  echo "$output" | grep -qE "not ready|missing_args|no_plan|readiness"
}

# ── Zweite Verteidigungslinie: opencode-exec.sh ─────────────────#
# OPENCODE_BIN wird auf /bin/true gestubbt: fehlt der Guard, startet das Skript
# sonst einen echten Orchestrator-Lauf aus der Testsuite heraus.
EXEC="scripts/factory/opencode-exec.sh"

# Verankert an EXIT-CODES, nicht am Wortlaut der Meldungen (T002716): Exit 6 =
# der Orchestrator lief und wurde erst HINTERHER als blocked bewertet (kein
# Commit, T003335); Exit 7 = wegen fehlendem Branch/Plan gar nicht erst gestartet.
# Exit 2 waere nicht brauchbar — den belegt bereits "opencode-Binary nicht
# gefunden" (T003275), beide Faelle waeren im Journal ununterscheidbar.
@test "T003773: opencode-exec startet den Lauf, wenn Branch und Plan gesetzt sind" {
  # Positiv-Anker: Exit 6 belegt, dass der Lauf ERREICHT wurde. Ohne ihn bestuende
  # der Negativtest unten auch bei einem generell kaputten Skript.
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-OK "$BATS_TEST_TMPDIR" main CLAUDE.md
  [ "$status" -eq 6 ]
}

@test "T003773: opencode-exec bricht ohne Branch/Plan ab, statt im Haupt-Checkout zu laufen" {
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-NOPLAN "$BATS_TEST_TMPDIR" null null
  [ "$status" -eq 7 ]
  echo "$output" | grep -qiE "ohne Branch/Plan|no_plan"
}

@test "T003773: ein Branch ohne die Plan-Datei wird als no_plan_on_branch abgelehnt" {
  _skip_without_origin
  local f; f="$(_prep_file T-GHOSTPLAN main "openspec/changes/gibt-es-nicht-T003773/tasks.md" /tmp)"

  run timeout 120 bash "$BRIDGE" "$f" --dry-run
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -qF "would launch pipeline for T-GHOSTPLAN"
}
