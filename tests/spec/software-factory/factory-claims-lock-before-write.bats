#!/usr/bin/env bats
#
# T003677 — Factory: agent-lock-Pflicht vor jedem Worktree-Schreibzugriff.
#
# Root-Cause (T003664): Die Factory schrieb ueber ~40 Minuten OHNE agent-lock
# in denselben Worktree wie eine parallele Session. Ein Factory-Commit mit
# `git add -A` wischte dabei eine fremde Aenderung (T003003-Fix in einer
# SKILL.md) in einen irrefuehrend betitelten Commit
# ("chore(plans): ergaenze fehlende .ticket-Datei ..." — 43 Deletionen).
# Der agent-lock-Mechanismus existierte, wurde aber im Factory-Write-Pfad
# nie beansprucht (P1: kein Claim vor dem Schreiben; P2: kein Pre-Check
# vor dem Betreten eines existierenden Worktrees).
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4) — die Tests 1+2 fuehren die
# echten Host-side-Kommandos aus (node scripts/factory/pipeline-runner.js
# lock-claim / lock-check / lock-release) und messen deren stdout sowie die
# Lock-Dateien im isolierten AGENT_LOCK_DIR. Kein Source-Grep im Testkoerper.
# Test 3 ist ein dokumentierter Querschnittstest (T002448-Ausnahme — das
# Resultat manifestiert sich im Quelltext: die Verdrahtung der Lock-Kommandos
# im Write-Pfad von pipeline.mjs / pipeline-runner.js).
#
# Isolation: AGENT_LOCK_DIR zeigt in ein Temp-Verzeichnis, AGENT_LOCK_SID
# setzt die Identitaet, AGENT_LOCK_FETCH_TTL=3600 begrenzt den pre-claim-Reap
# auf einen Versuch. Die node-Aufrufe laufen aus einem Nicht-Git-cwd, damit
# cmd_reap (git worktree prune / git fetch) keine Repo-Nebeneffekte hat.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  TMP="$(mktemp -d)"
  LOCK_DIR="$TMP/locks"
  mkdir -p "$LOCK_DIR" "$TMP/wt"
}

teardown() {
  rm -rf "$TMP" 2>/dev/null || true
}

claim_file() {
  printf '%s/branch__%s.json' "$LOCK_DIR" "$(printf '%s' "$1" | tr '/ ' '--')"
}

run_factory() { # <command> <json-payload>
  cd "$TMP"
  run env AGENT_LOCK_DIR="$LOCK_DIR" AGENT_LOCK_SID="factory-sid-0001" \
    AGENT_LOCK_FETCH_TTL=3600 \
    node "$REPO_ROOT/scripts/factory/pipeline-runner.js" "$1" "$2"
}

# BATS `run` merged stdout+stderr. cmd_reap's advisory half-archive check
# (scripts/openspec-half-archive-check.sh) prints a non-JSON line to stdout
# whenever agent-lock.sh runs from inside a git repo. The runner's own stdout
# is always a single JSON line starting with '{' — extract exactly that.
factory_json() { # <jq-filter>
  printf '%s\n' "$output" | grep -E '^\{' | tail -1 | jq -e "$1" >/dev/null
}

@test "factory claims branch lock before any worktree write (P1: lock exists at commit time)" {
  BRANCH="fix/demo-T009999"
  CLAIM_FILE="$(claim_file "$BRANCH")"

  # Git-Repo simulieren, in das die Factory im Test "schreibt".
  mkdir -p "$TMP/repo"
  git -C "$TMP/repo" init -q
  git -C "$TMP/repo" config user.email factory@test
  git -C "$TMP/repo" config user.name factory
  echo x > "$TMP/repo/file.txt"
  git -C "$TMP/repo" add file.txt
  git -C "$TMP/repo" commit -qm init

  # P1: lock-claim ist der erste Schritt des Factory-Write-Pfads
  # (pipeline.mjs setupWorktree) — das Claim MUSS vor jedem Schreiben stehen.
  run_factory lock-claim "{\"branch\":\"$BRANCH\",\"worktree\":\"$TMP/wt\",\"ticket_id\":\"T009999\"}"
  [ "$status" -eq 0 ]
  factory_json '.ok == true'

  # Positiv-Anker: die Claim-Datei existiert VOR dem git-Commit und traegt
  # die Factory-Kennung (Label, Branch, Worktree-Pfad).
  [ -f "$CLAIM_FILE" ]
  grep -q '"label": "factory-pipeline"' "$CLAIM_FILE"
  grep -q "\"branch\": \"$BRANCH\"" "$CLAIM_FILE"
  grep -q "\"worktree\": \"$TMP/wt\"" "$CLAIM_FILE"

  # Der Factory-Schreibzugriff (git add -A + Commit im Worktree) laeuft
  # UNTER dem Lock — die Claim-Datei steht zu diesem Zeitpunkt noch, und erst
  # der zweite Commit (mit der tatsaechlichen Aenderung) ist der Factory-Commit.
  echo y >> "$TMP/repo/file.txt"
  git -C "$TMP/repo" add -A
  git -C "$TMP/repo" commit -qm "feat(demo): task p1 [factory]"
  [ -f "$CLAIM_FILE" ]

  # Nach Abschluss: lock-release entfernt den eigenen Claim.
  run_factory lock-release "{\"branch\":\"$BRANCH\"}"
  [ "$status" -eq 0 ]
  factory_json '.released == true'
  [ ! -f "$CLAIM_FILE" ]
}

@test "foreign live lock defers the factory claim (P2: no overwrite of a held branch)" {
  BRANCH="fix/demo-T009998"
  CLAIM_FILE="$(claim_file "$BRANCH")"

  # Fremde Session haelt den Branch (anderer SID — nicht-numerisch, immer live).
  run env AGENT_LOCK_DIR="$LOCK_DIR" AGENT_LOCK_SID="foreign-sid-0002" \
    AGENT_LOCK_FETCH_TTL=3600 \
    bash "$REPO_ROOT/scripts/agent-lock.sh" claim branch "$BRANCH" \
      --worktree "$TMP/wt" --label foreign-session --ticket T009998
  [ "$status" -eq 0 ]
  [ -f "$CLAIM_FILE" ]

  # P2: Der Factory-lock-claim MUSS abgelehnt werden (ok=false) — das ist die
  # Defer-Bedingung von setupWorktree (reason: branch-locked): ueberspringen,
  # nicht ueberschreiben.
  run_factory lock-claim "{\"branch\":\"$BRANCH\",\"worktree\":\"$TMP/wt\",\"ticket_id\":\"T009998\"}"
  [ "$status" -eq 0 ]
  factory_json '.ok == false'

  # Positiv-Anker zur Negativ-Aussage: der fremde Claim wurde NICHT
  # ueberschrieben — Owner und Label sind unveraendert.
  grep -q '"owner_sid": "foreign-sid-0002"' "$CLAIM_FILE"
  grep -q '"label": "foreign-session"' "$CLAIM_FILE"

  # lock-check meldet aus Factory-Sicht 'held' (Defer-Signal).
  run_factory lock-check "{\"branch\":\"$BRANCH\"}"
  [ "$status" -eq 0 ]
  factory_json '.state == "held"'
}

@test "pipeline.mjs wires lock-claim into the worktree write path (source cross-section)" {
  # Querschnittstest (T002448-Ausnahme): das Resultat manifestiert sich im
  # Quelltext — die Verdrahtung der Lock-Kommandos im Write-Pfad.
  PIPE="$REPO_ROOT/scripts/factory/pipeline.mjs"
  RUNNER="$REPO_ROOT/scripts/factory/pipeline-runner.js"

  # Die Host-side-Kommandos existieren im Runner (Tests 1+2 pruefen deren
  # Laufzeitverhalten).
  grep -qF "command === 'lock-claim'" "$RUNNER"
  grep -qF "command === 'lock-check'" "$RUNNER"
  grep -qF "command === 'lock-release'" "$RUNNER"

  # setupWorktree deferriert bei Fremd-Lock (P2) und claimt vor dem
  # Worktree-Zugriff (P1).
  grep -qF "reason: 'branch-locked'" "$PIPE"

  # Der finally-Block gibt den Claim VOR cleanup.sh frei — cleanup.sh
  # ueberspringt das Worktree-/Branch-Removal bei live Agent-Lock (T002896);
  # erst die Freigabe macht die Aufraeumung moeglich. Anker auf dem echten
  # cleanup-Aufruf (nicht auf der Kommentarzeile "BEFORE cleanup.sh");
  # der Aufruf heisst lockRelease (camelCase), das Runner-Kommando lock-release.
  awk '/^} finally \{/,/cleanup.sh --branch/' "$PIPE" | grep -qF "lockRelease"
}
