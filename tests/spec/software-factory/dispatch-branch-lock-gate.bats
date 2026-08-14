#!/usr/bin/env bats
# tests/spec/software-factory/dispatch-branch-lock-gate.bats
# SSOT: openspec/specs/software-factory.md — Requirement "Dispatch-Branch-Lock-Gate"
#
# [T004610] Doppel-Dispatch: dispatcher-bridge.sh startete einen ZWEITEN
# Orchestrator (opencode run --agent orchestrator) fuer ein plan_staged-Ticket,
# waehrend dev-flow-execute dasselbe Ticket im selben Worktree bereits
# branch-scoped geclaimt hatte (beobachtet 2026-08-14, PID 3869086, 41% CPU,
# ueberschrieb Testdateien des Executors).
#
# Pruefmodus: OUTPUT-Verifikation (T002448-M4) — der Test FUEHRT
# dispatcher-bridge.sh mit --dry-run gegen ein synthetisches Prep-File AUS und
# prueft die stderr-Zeilen. Der branch-scoped Claim wird ueber AGENT_LOCK_DIR
# in ein isoliertes Lock-Verzeichnis gelegt (agent-lock.sh Test-Override, siehe
# scripts/agent-lock.sh Kopf), damit der Test offline ohne echte Session laeuft.
#
# Der Defekt: check_ticket_readiness (T003773) prueft Branch-Existenz und Plan
# auf dem Branch, aber KEINEN agent-lock. Ein parallel laufender Executor, der
# den Branch-Lock haelt, wird nicht erkannt — der Launch geht trotzdem raus.

load '_sf_common'

REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
BRIDGE="${REPO_ROOT}/scripts/factory/dispatcher-bridge.sh"
LOCK_BIN="${REPO_ROOT}/scripts/agent-lock.sh"

setup() {
  _sf_setup
  WORK="$(mktemp -d "${BATS_TEST_TMPDIR:-/tmp}/dispatch-lock.XXXXXX")"
  BARE="$WORK/origin.git"
  CLONE="$WORK/clone"
  git init --quiet --bare "$BARE"
  git clone --quiet "$BARE" "$CLONE"
  mkdir -p "$CLONE/openspec/changes/demo"
  echo "# demo plan" > "$CLONE/openspec/changes/demo/tasks.md"
  (
    cd "$CLONE"
    git config user.email t@t.test
    git config user.name test
    git add -A
    git commit --quiet -m "add plan"
    git branch -M main
    git push --quiet -u origin main
  )
  PLAN_ON_BRANCH="openspec/changes/demo/tasks.md"
  # Isoliertes Lock-Verzeichnis: dispatcher-bridge.sh/agent-lock.sh lesen
  # AGENT_LOCK_DIR aus der Umgebung (Test-Override, kein git-common-dir nötig).
  export AGENT_LOCK_DIR="$WORK/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  # Nicht-numerische SID gilt per agent-lock-Regel als lebendig (kein pgrep).
  export AGENT_LOCK_SID="dispatch-lock-test-$$"
}

teardown() { rm -rf "${WORK:-}"; _sf_teardown; }

# Fuehrt die Bridge im Fixture-Klon aus (CWD = CLONE, damit git ls-remote/show
# gegen das Fixture gehen). Das Skript kommt per absolutem Pfad aus dem Repo.
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
# MUSS vor der Negativ-Aussage stehen: ohne ihn bestuende der Negativtest
# unten auch dann, wenn dispatcher-bridge.sh ueberhaupt nichts mehr launcht.
@test "T004610: freier Branch passiert das Dispatch-Gate weiterhin (Positiv-Anker)" {
  local f; f="$(_prep_file T-FREE main "$PLAN_ON_BRANCH" /tmp)"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  echo "$output" | grep -F "T-FREE" | grep -qE "would launch pipeline|launching pipeline|budget-guard"
  [ "$(printf '%s\n' "$output" | grep -F "T-FREE" | grep -c "not ready")" -eq 0 ]
}

# ── Negativ-Aussage: branch-scoped Claim blockiert den Launch ────#
@test "T004610: branch-scoped geclaimter Branch wird NICHT gelauncht (Doppel-Dispatch-Guard)" {
  # Simuliert die laufende dev-flow-execute-Session: branch-scoped Claim auf
  # den Ziel-Branch (genau der Lock-Typ, den die dev-flow-Skills setzen,
  # T002498-M6 — ticket-Scope bleibt dabei leer).
  bash "$LOCK_BIN" claim branch main --worktree "$CLONE" --branch main \
    --label dev-flow-execute >/dev/null 2>&1

  local f; f="$(_prep_file T-LOCKED main "$PLAN_ON_BRANCH" "$CLONE")"

  _run_bridge "$f"
  [ "$status" -eq 0 ]
  # Kein Launch — weder echt noch als Dry-Run-Ankuendigung.
  [ "$(printf '%s\n' "$output" | grep -cF "would launch pipeline for T-LOCKED")" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -cF "launching pipeline for T-LOCKED")" -eq 0 ]
  # Der Skip nennt den Lock-Grund, statt still zu verschwinden (T002716:
  # Semantik statt Darstellung — Exit-Codes und Grund-Zeile, nicht Wortlaut).
  echo "$output" | grep -F "T-LOCKED" | grep -qiE "lock|claim|held|besetzt"
}

# ── Zweite Verteidigungslinie: opencode-exec.sh ─────────────────#
# OPENCODE_BIN wird auf /bin/true gestubbt: fehlt der Guard, startet das
# Skript sonst einen echten Orchestrator-Lauf aus der Testsuite heraus.
EXEC="${REPO_ROOT}/scripts/factory/opencode-exec.sh"

@test "T004610: opencode-exec startet den Orchestrator NICHT, wenn der Branch geclaimt ist" {
  bash "$LOCK_BIN" claim branch main --worktree "$CLONE" --branch main \
    --label dev-flow-execute >/dev/null 2>&1

  # Exit 7 = wegen Lock gar nicht erst gestartet (belegte Exit-Codes: 6 =
  # lief und wurde als blocked bewertet, 7 = fehlender Branch/Plan, T003773).
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-LOCKED "$CLONE" main "$PLAN_ON_BRANCH"
  [ "$status" -eq 7 ]
  echo "$output" | grep -qiE "lock|claim|held|besetzt"
}

@test "T004610: opencode-exec startet den Lauf, wenn der Branch frei ist (Positiv-Anker)" {
  run env OPENCODE_BIN=/bin/true timeout 60 bash "$EXEC" T-EXEC-FREE "$CLONE" main "$PLAN_ON_BRANCH"
  [ "$status" -eq 6 ]
}
