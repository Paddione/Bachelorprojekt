#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
# tests/spec/batch-git-worktree-integrity.bats — Batch T003795 (Git/Worktree-Integrität P2-P4)
#
# Kind-Tickets:
#   T003069  Teil-Pop von `git stash pop` nach Rebase sieht aus wie Erfolg — der
#            post-rewrite-Hook regeneriert ein gestashtes Freshness-Artefakt, der
#            Pop wendet nur teilweise an, meldet aber Erfolg. Fix: positive
#            Verifikation — der eigene Eintrag (per Nachricht identifiziert) MUSS
#            nach dem Pop aus `git stash list` verschwunden sein.
#   T003070  refs/stash liegt im gemeinsamen Git-Verzeichnis — der Stash-Stack ist
#            über alle Worktrees geteilt, Indizes stash@{N} sind durch fremde
#            Pushes instabil. Fix: nachrichtenbasierte Auflösung
#            (scripts/git-stash-net.sh), nie über den Index.
#   T003105  Konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte
#            still (merge=ours in .gitattributes löst ohne Konfliktmarker).
#            Fix: Workflow-Regel in BEIDEN Git-Workflow-Skills.
#   T003131  worktree-write-guard kennt OPENCODE_SESSION_ID nicht (SID driftet in
#            opencode-Sessions), Besitz-Meldung nennt die Quelle nicht, Dedup.
#
# PRÜFMODUS: Kommando-Ergebnis-Verifikation (T002448-M4) — Assertions auf
# command output und exit codes in Wegwerf-Git-Repos unter $BATS_TEST_TMPDIR.
# Das echte Repo (inkl. seines refs/stash) wird nicht berührt.
# EINZIGE AUSNAHME (dokumentiert): der T003105-Block prüft den Regel-TEXT der
# beiden Skill-Dateien — dort IST der Text das Verhalten (Workflow-Regel), wie
# in tests/spec/ci-cd/freshness-regen-rebase-guard.bats dokumentiert.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STASH_NET="$REPO_ROOT/scripts/git-stash-net.sh"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"
}

# Wegwerf-Repo mit einem base-Commit (zwei Dateien). Muster aus
# tests/spec/worktree-divergence-guard/stash-restore-visible.bats.
_init_fx() {  # $1 = Verzeichnis
  local fx="$1"
  git init -q -b main "$fx"
  git -C "$fx" config user.email "batch-p2@example.invalid"
  git -C "$fx" config user.name "Batch P2 Test"
  git -C "$fx" config commit.gpgsign false
  echo "base-inhalt" > "$fx/alpha.txt"
  echo "base-inhalt" > "$fx/beta.txt"
  git -C "$fx" add -A
  git -C "$fx" commit -qm "base"
}

# ─────────────────────────────────────────────────────────────────────────────
# T003069 — Teil-Pop ist ein BEFUND, kein Erfolg
# ─────────────────────────────────────────────────────────────────────────────

@test "T003069: Teil-Pop meldet BEFUND (exit 1), Eintrag bleibt als Sicherungsnetz" {
  local fx="$BATS_TEST_TMPDIR/fx069"
  _init_fx "$fx"

  # Stash mit ZWEI Dateien anlegen; der Eintrag liegt bei stash@{0}.
  echo "stash-inhalt-alpha" > "$fx/alpha.txt"
  echo "stash-inhalt-beta"  > "$fx/beta.txt"
  git -C "$fx" stash push -qm "T003069 teilpop-fixture"

  # Positiv-Anker [T002356-M1]: der Eintrag existiert wirklich.
  run git -C "$fx" stash list
  grep -qF "T003069 teilpop-fixture" <<<"$output"

  # Externer Commit ändert alpha.txt in derselben Zeile → der Pop kann nur
  # teilweise anwenden (beta.txt sauber, alpha.txt Konflikt), git droppt den
  # Eintrag nicht — genau die T003069-Lage (nur dass git hier zusätzlich einen
  # Exit-Code liefert; das Skript verlässt sich NUR auf die Eintrags-Zählung).
  echo "base-inhalt-neu" > "$fx/alpha.txt"
  git -C "$fx" add alpha.txt
  git -C "$fx" commit -qm "externer Commit aendert alpha.txt"

  run bash -c "cd '$fx' && bash '$STASH_NET' pop --by-message 'T003069 teilpop-fixture'"

  # Befund, kein Erfolg.
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF "BEFUND"
  # Wiederherstellungspfad ist Teil der Meldung.
  printf '%s\n' "$output" | grep -qF 'git checkout "stash@{0}" -- <pfad>'
  # Der Eintrag bleibt als Sicherungsnetz erhalten.
  run git -C "$fx" stash list
  grep -qF "T003069 teilpop-fixture" <<<"$output"
  # Die konfliktfreie Hälfte wurde trotzdem angewendet (Semantik des Teil-Pop).
  grep -qF "stash-inhalt-beta" "$fx/beta.txt"
}

# ─────────────────────────────────────────────────────────────────────────────
# T003070 — nachrichtenbasierte Auflösung statt Index
# ─────────────────────────────────────────────────────────────────────────────

@test "T003070: find --by-ticket findet den Eintrag trotz Index-Verschiebung (stash@{1})" {
  local fx="$BATS_TEST_TMPDIR/fx070a"
  _init_fx "$fx"

  # Zuerst den T003070-Eintrag anlegen, DANN einen fremden → der eigene liegt
  # bei stash@{1}, nicht bei stash@{0}.
  echo "t070-inhalt" > "$fx/alpha.txt"
  git -C "$fx" stash push -qm "T003070 safety net"
  echo "anderer-inhalt" > "$fx/beta.txt"
  git -C "$fx" stash push -qm "anderer-eintrag"

  run bash -c "cd '$fx' && bash '$STASH_NET' find --by-ticket T003070"
  [ "$status" -eq 0 ]
  local out="$output"
  # Positiv-Anker: der Index in der Ausgabe stimmt (der Nachricht nach auflösen).
  grep -qF 'stash@{1}' <<<"$out"
  grep -qF 'T003070 safety net' <<<"$out"
  # Negativ-Aussage: der fremde Eintrag erscheint nicht.
  if grep -qF 'anderer-eintrag' <<<"$out"; then
    echo "Fremder Eintrag darf nicht gelistet werden" >&2
    return 1
  fi
}

@test "T003070: pop --by-message droppt den RICHTIGEN Eintrag, der fremde bleibt" {
  local fx="$BATS_TEST_TMPDIR/fx070b"
  _init_fx "$fx"

  echo "t070-inhalt" > "$fx/alpha.txt"
  git -C "$fx" stash push -qm "T003070 safety net"
  echo "anderer-inhalt" > "$fx/beta.txt"
  git -C "$fx" stash push -qm "anderer-eintrag"

  run bash -c "cd '$fx' && bash '$STASH_NET' pop --by-message 'T003070 safety net'"
  [ "$status" -eq 0 ]
  # Positive Verifikation am Ergebnis: die gestashte Datei ist zurück.
  grep -qF "t070-inhalt" "$fx/alpha.txt"
  # Der T003070-Eintrag ist weg …
  run git -C "$fx" stash list
  local out="$output"
  if grep -qF 'T003070' <<<"$out"; then
    echo "T003070-Eintrag muss nach dem Pop entfernt sein" >&2
    return 1
  fi
  # … der fremde Eintrag überlebt (Positiv-Anker der Negativ-Aussage).
  grep -qF 'anderer-eintrag' <<<"$out"
}

# ─────────────────────────────────────────────────────────────────────────────
# T003105 — merge=ours-Rebase als Freshness-Risiko benannt (Textvertrag)
# ─────────────────────────────────────────────────────────────────────────────

@test "T003105: beide Git-Workflow-Skills benennen merge=ours und freshness:check im Rebase-Kontext" {
  local skill
  for skill in \
    ".claude/skills/git-workflow/SKILL.md" \
    ".opencode/skills/opencode-git-workflow/SKILL.md"; do
    local f="$REPO_ROOT/$skill"
    # Positiv-Anker: die Datei existiert und ist nicht leer — ohne sie misst
    # der Test nichts (T002356-M1).
    [ -s "$f" ] || { echo "MISSING skill file: $f"; return 1; }
    # merge=ours (.gitattributes) löst ohne Konfliktmarker zugunsten einer
    # Seite auf — ein grüner Rebase belegt die Artefakt-Vollständigkeit nicht.
    grep -qF 'merge=ours' "$f" || { echo "merge=ours fehlt in $f"; return 1; }
    # Die Regel: nach JEDEM Rebase VOR dem Push freshness:check erneut.
    grep -qF 'task freshness:check' "$f" || { echo "task freshness:check fehlt in $f"; return 1; }
    # Ticket-Referenz verankert die Regel im Repo-Kontext.
    grep -qF 'T003105' "$f" || { echo "T003105-Referenz fehlt in $f"; return 1; }
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# T003131 — worktree-write-guard: OPENCODE_SESSION_ID, Besitz-Quelle, Dedup
# ─────────────────────────────────────────────────────────────────────────────
#
# Der Guard ist ein PreToolUse-Hook: Eingabe als JSON auf stdin, Entscheidung
# als Exit-Code (0 = erlauben, 2 = blocken). In BATS wird er isoliert als
# Kommando ausgeführt (Muster: tests/spec/active-sessions-hub/
# agent-lock-scope-regelwerk.bats). ALLES — Fixture-Repo, Claims, Zielpfade —
# liegt unter $BATS_TEST_TMPDIR; der Guard wird mit cwd im Fixture-Repo
# ausgeführt, damit sein MAIN_ROOT das Fixture-Repo ist.

# Gemeinsames Setup: Wegwerf-Repo + ein (existierender!) Claim-Worktree.
# Setzt OPENCODE_SESSION_ID als einzige SID-Quelle — die Harness exportiert
# CLAUDE_CODE_SESSION_ID real, die muss ausdrücklich weg (Muster aus
# tests/spec/agent-lock-session-identity.bats).
_guard_fx() {  # $1 = Verzeichnis
  unset CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID AGENT_LOCK_SID
  export OPENCODE_SESSION_ID="sid-opencode-131"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/guard-locks"
  mkdir -p "$AGENT_LOCK_DIR"
  # cmd_reap-Fetch-TTL (T002502): Marker vorbelegen, damit claim keinen
  # Netz-Fetch auslöst und keine Branch-Sweeps auf dem Fixture laufen.
  touch "$AGENT_LOCK_DIR/.last-fetch"

  local fx="$1"
  git init -q -b main "$fx"
  git -C "$fx" config user.email "batch-p2@example.invalid"
  git -C "$fx" config user.name "Batch P2 Test"
  git -C "$fx" config commit.gpgsign false
  echo "inhalt" > "$fx/README.md"
  git -C "$fx" add -A
  git -C "$fx" commit -qm "base"
  mkdir -p "$fx/wt-alpha"
}

@test "T003131: Guard akzeptiert eigene Claims ueber OPENCODE_SESSION_ID und nennt die Besitz-Quelle" {
  local fx="$BATS_TEST_TMPDIR/guard-fx-a"
  _guard_fx "$fx"

  # Claim über agent-lock.sh mit derselben SID — die NUR als
  # OPENCODE_SESSION_ID gesetzt ist (die T003131-Falle vor dem Fix).
  run bash -c "cd '$fx' && bash '$LOCK' claim branch wg-test-131 --worktree '$fx/wt-alpha' --label selftest"
  [ "$status" -eq 0 ]
  grep -qF '"owner_sid": "sid-opencode-131"' "$AGENT_LOCK_DIR/branch__wg-test-131.json"

  # 1) Schreiben in den eigenen Claim → erlaubt (exit 0). Vor dem Fix driftete
  #    die SID auf den Unix-Fallback und der eigene Claim galt als fremd (exit 2).
  run bash -c "cd '$fx' && printf '{\"tool_input\":{\"file_path\":\"%s/neu.txt\"}}' '$fx/wt-alpha' | bash '$GUARD'"
  [ "$status" -eq 0 ]

  # 2) Positiv-Anker: Ziel ausserhalb des Claims → Regel 2 greift (exit 2) …
  run bash -c "cd '$fx' && printf '{\"tool_input\":{\"file_path\":\"%s/README.md\"}}' '$fx' | bash '$GUARD'"
  [ "$status" -eq 2 ]
  # … und die Meldung nennt die QUELLE des Besitzes (Lock-Dateien, owner_sid-Match).
  printf '%s\n' "$output" | grep -qF 'agent-locks'
  printf '%s\n' "$output" | grep -qF 'owner_sid'
}

@test "T003131: branch- und worktree-Scope-Lock auf denselben Worktree erscheint genau einmal" {
  local fx="$BATS_TEST_TMPDIR/guard-fx-b"
  _guard_fx "$fx"

  # Zwei Claims (branch- UND worktree-Scope) auf denselben Pfad — die
  # Konstellation aus T003131, die ohne Dedup den Worktree doppelt listet.
  run bash -c "cd '$fx' && bash '$LOCK' claim branch wg-test-131 --worktree '$fx/wt-alpha' --label selftest"
  [ "$status" -eq 0 ]
  run bash -c "cd '$fx' && bash '$LOCK' claim worktree wg-test-131 --worktree '$fx/wt-alpha' --label selftest"
  [ "$status" -eq 0 ]

  run bash -c "cd '$fx' && printf '{\"tool_input\":{\"file_path\":\"%s/README.md\"}}' '$fx' | bash '$GUARD'"
  [ "$status" -eq 2 ]
  local out="$output"
  local count
  count="$(printf '%s\n' "$out" | grep -cF "$fx/wt-alpha" || true)"
  # Positiv-Anker: der Worktree taucht überhaupt auf.
  [ "$count" -gt 0 ]
  # Die Zusicherung: genau einmal, nicht je Lock-Datei erneut.
  [ "$count" -eq 1 ]
}
