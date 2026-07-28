#!/usr/bin/env bats
# tests/spec/agent-lock-session-identity.bats
# SSOT: openspec/specs/active-sessions-hub.md (Identity is harness-stable)
# Consolidated BATS suite for the agent-lock / dev-flow mishap bundle (T001268).
# Covers the three mishaps from the bundle:
#   - Mishap 1: agent-lock-Session-Identität driftet pro Bash-Aufruf
#               (scripts/agent-lock.sh — _my_sid honours CLAUDE_SESSION_ID)
#   - Mishap 2: Local main hatte stale Commit der nie auf origin war
#               (skills/dev-flow-plan — explicit pre-commit guards)
#   - Mishap 3: Implementer-Subagent pusht Archive-Commits nicht
#               (skills/dev-flow-execute — push-verification checkpoint)
#
# This file is the RED phase of the fix: all three guards must FAIL on the
# current `fix/t001268-...` branch (and on main) before dev-flow-execute
# implements the fix. After the fix lands, all three must be GREEN.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  PLAN_SKILL="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  EXEC_SKILL="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
}

# ── Mishap 1: agent-lock identity drift ────────────────────────────────#
#
# The Claude Code / opencode harness exposes a session ID for telemetry
# (CLAUDE_SESSION_ID). When it is set, scripts/agent-lock.sh MUST use it
# as the canonical owner identity so claims survive across bash tool calls.
# Currently _my_sid() only honours the test override AGENT_LOCK_SID — it
# does not check CLAUDE_SESSION_ID — so claims drift per call.

@test "T001268-M1: agent-lock uses CLAUDE_SESSION_ID as the owner_sid when set" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset AGENT_LOCK_SID
  # [T002375-p1] CLAUDE_CODE_SESSION_ID muss ausdruecklich weg: die Harness exportiert
  # sie real, und sie steht in der normativen Reihenfolge VOR CLAUDE_SESSION_ID.
  # Ohne dieses unset prueft der Test die Umgebung statt die Vorbedingung — genau
  # die Fehlerklasse, die dieses Bundle behandelt.
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="claude-session-fixed-1234"
  run bash "$LOCK" claim ticket T001268-m1 --label mishap1
  [ "$status" -eq 0 ]
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T001268-m1.json")
  [ "$owner" = "claude-session-fixed-1234" ]
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T001268-M1: agent-lock treats different CLAUDE_SESSION_ID values as different owners" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset AGENT_LOCK_SID
  # [T002375-p1] CLAUDE_CODE_SESSION_ID muss ausdruecklich weg: die Harness exportiert
  # sie real, und sie steht in der normativen Reihenfolge VOR CLAUDE_SESSION_ID.
  # Ohne dieses unset prueft der Test die Umgebung statt die Vorbedingung — genau
  # die Fehlerklasse, die dieses Bundle behandelt.
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="session-A"
  bash "$LOCK" claim ticket T001268-m1b
  owner_a=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T001268-m1b.json")
  export CLAUDE_SESSION_ID="session-B"
  run bash "$LOCK" claim ticket T001268-m1b
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
  [ "$owner_a" = "session-A" ]
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 2: dev-flow-plan stale-commit-on-main guard ──────────────────#
#
# The plan-stage commit in dev-flow-plan Schritt 5 must NEVER land on main.
# The skill must explicitly document: (a) refuse if current branch is main,
# (b) require git status to be clean, (c) cross-check branch against the
# agent-lock claim. Currently the skill says "git commit && git push" with
# no such guard.

@test "T001268-M2: dev-flow-plan SKILL.md explicitly forbids plan-stage commit on main" {
  [ -f "$PLAN_SKILL" ]
  # The rule must be present and clear: dev-flow-plan must instruct the
  # operator to NOT commit on main, and ideally cite a worktree branch
  # invariant.
  grep -Eqi 'do[[:space:]]+not[[:space:]]+commit[[:space:]]+on[[:space:]]+main|nicht[[:space:]]+auf[[:space:]]+main[[:space:]]+committen|refuse.*main|kein[[:space:]]+commit[[:space:]]+auf[[:space:]]+main|main.*verboten|main.*verweigern' "$PLAN_SKILL"
}

@test "T001268-M2: dev-flow-plan SKILL.md requires clean git status before plan-stage commit" {
  [ -f "$PLAN_SKILL" ]
  grep -Eqi 'git[[:space:]]+status.*(clean|leer|empty)|clean[[:space:]]+status|status.*clean|verify.*git[[:space:]]+status|sauberer[[:space:]]+status' "$PLAN_SKILL"
}

# ── Mishap 3: dev-flow-execute push-verification checkpoint ────────────#
#
# The archive steps in dev-flow-execute Schritt 7 must be push-required.
# The subagent return contract must include push_verified:<sha> AND the
# skill must instruct the operator to verify the push via git ls-remote
# before declaring the archive complete.

@test "T001268-M3: dev-flow-execute SKILL.md requires push verification via git ls-remote" {
  [ -f "$EXEC_SKILL" ]
  # T002181: die Push-Verifikation stand einmal direkt im SKILL.md. Schritt 7
  # verweist heute verbindlich auf references/plan-archive-steps.md, wo sie als
  # `git ls-remote`-Abgleich umgesetzt ist. Die Anforderung ist unverändert;
  # geprüft wird die Kette (Verweis vorhanden + Referenz trägt die Mechanik).
  grep -qF 'T001268' "$EXEC_SKILL"
  local archive_ref="$REPO/.claude/skills/references/plan-archive-steps.md"
  [ -f "$archive_ref" ] || archive_ref="$REPO/.agents/skills/references/plan-archive-steps.md"
  [ -f "$archive_ref" ]
  grep -Eqi 'ls-remote|push_verified' "$archive_ref"
}

@test "T001268-M3: dev-flow-execute SKILL.md mandates push_verified:<sha> in subagent return contract" {
  # T002181: der benannte Rückgabemarker `push_verified:<sha>` existiert
  # nirgends mehr im Repo. Aufgegeben wurde aber nur der Marker-Name, nicht die
  # Anforderung: plan-archive-steps.md vergleicht Remote- und Local-SHA und
  # bricht bei Abweichung ab — inhaltlich genau die geforderte Verifikation.
  # Geprüft wird daher der SHA-Abgleich statt des Marker-Strings.
  [ -f "$EXEC_SKILL" ]
  local archive_ref="$REPO/.claude/skills/references/plan-archive-steps.md"
  [ -f "$archive_ref" ] || archive_ref="$REPO/.agents/skills/references/plan-archive-steps.md"
  [ -f "$archive_ref" ]

  grep -qF 'REMOTE_SHA' "$archive_ref"
  grep -qF 'LOCAL_SHA' "$archive_ref"
  # Der Abgleich muss fail-closed sein: Abweichung bricht ab.
  grep -qE '\[ "\$REMOTE_SHA" = "\$LOCAL_SHA" \]' "$archive_ref"
}

# ── T001386: Feature-Pfad fehlt expliziter Ticket-Claim vor Pre-Commit-Guard ──#
#
# dev-flow-plan Schritt 5's Pre-Commit-Guard (introduced by T001268-M2) checks
# .git/agent-locks/ticket__$TICKET_EXT_ID.json — a ticket-scoped agent-lock
# claim. The Fix-Pfad creates this claim explicitly in Schritt 2.5 ("claim
# ticket"). The Feature-Pfad's Phase B Schritt B.1 only claims `branch`, never
# `ticket` — because the ticket is normally created much later, in Schritt
# 4.5. The guard in Schritt 5 therefore reads a file that (in the Feature-Pfad)
# was never created, producing a false-negative branch-mismatch failure.
#
# Fix: the Feature-Pfad must gain an explicit `claim ticket` step, positioned
# where the ticket ID first becomes known — Schritt B.1 (if a ticket ID was
# already handed in, e.g. by feature-intake) AND/OR Schritt 4.5 (the regular
# case, right after the ticket is created/reused, before Schritt 5 runs).

@test "T001386: dev-flow-plan Feature-Pfad Schritt B.1 claims ticket when TICKET_EXT_ID is already known" {
  [ -f "$PLAN_SKILL" ]
  # T002303: Die Phasen A/B/C standen einmal ausformuliert im SKILL.md. Der Body
  # verweist heute verbindlich auf references/dev-flow-plan-phases.md, wo Schritt B.1
  # den Claim trägt. Die Anforderung ist unverändert; geprüft wird die Kette
  # (Verweis vorhanden + Referenz trägt die Mechanik) — analog T002181/T001268-M3.
  grep -qF 'dev-flow-plan-phases' "$PLAN_SKILL"
  local phases_ref="$REPO/.claude/skills/references/dev-flow-plan-phases.md"
  [ -f "$phases_ref" ]
  awk '/^#### Schritt B\.1:/{flag=1} /^#### Schritt B\.2:/{flag=0} flag' "$phases_ref" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Feature-Pfad Schritt 4.5 claims ticket after ticket creation, before Schritt 5" {
  [ -f "$PLAN_SKILL" ]
  # Between the "Schritt 4.5" heading and the next "Schritt 5" heading, the
  # text must contain an agent-lock.sh claim ticket invocation (Session-
  # Koordination [T000510]) so the Schritt 5 guard has something to read.
  awk '/^### Schritt 4\.5:/{flag=1} /^### Schritt 5:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eq 'agent-lock\.sh[[:space:]]+claim[[:space:]]+ticket'
}

@test "T001386: dev-flow-plan Schritt 5 Pre-Commit-Guard checks lock-file existence before reading it" {
  [ -f "$PLAN_SKILL" ]
  # The branch-vs-claim check (guard check 3) must fail loudly with a
  # dedicated message if the ticket-scoped lock file is missing, instead of
  # silently comparing against an empty string from a failed jq lookup.
  awk '/^### Schritt 5:/{flag=1} /^### Schritt 6:/{flag=0} flag' "$PLAN_SKILL" \
    | grep -Eqi '\-f[[:space:]]+"?\$LOCK_FILE"?|kein[[:space:]]+ticket-scoped[[:space:]]+agent-lock'
}

# ── T002261-M1: cmd_release schweigt bei SID-Mismatch ────────────────#
#
# When `cmd_release` is called with a SID that does not match the lock
# owner, and the tool class also differs, it must emit a diagnostic line
# to stderr so the operator knows why the release failed and how to force it.
# The same-tool fallback (T002374) allows release when tool class matches,
# so this test uses a DIFFERENT tool class to trigger the diagnostic.
#
# NOTE: The SID mismatch detection relies on _my_sid derived from $$/PPID. When the claim
# was issued inside a subshell, the SID may differ, causing a false mismatch. See comment
# in scripts/agent-lock.sh cmd_release.

@test "T002261-M1: cmd_release emits stderr diagnostic on SID mismatch" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  # Claim the lock as "session-A" under claude tool
  # [T002375-p1] CLAUDE_CODE_SESSION_ID muss ausdruecklich weg: die Harness exportiert
  # sie real, und sie steht in der normativen Reihenfolge VOR CLAUDE_SESSION_ID.
  # Ohne dieses unset prueft der Test die Umgebung statt die Vorbedingung — genau
  # die Fehlerklasse, die dieses Bundle behandelt.
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="session-A"
  unset AGENT_LOCK_SID
  bash "$LOCK" claim ticket T002261-m1 --label test-release
  [ -f "$AGENT_LOCK_DIR/ticket__T002261-m1.json" ]

  # Switch to a different session AND different tool class (gemini) to bypass
  # the same-tool fallback and trigger the SID-mismatch diagnostic. [T002374]
  unset CLAUDE_SESSION_ID
  export GEMINI_CLI=1
  run bash "$LOCK" release ticket T002261-m1
  [ "$status" -eq 1 ]

  # stderr must NOT be empty — the fix adds a diagnostic message
  [[ -n "$output" ]]

  # Lock file must still exist (release was refused)
  [ -f "$AGENT_LOCK_DIR/ticket__T002261-m1.json" ]

  unset GEMINI_CLI
  rm -rf "$AGENT_LOCK_DIR"
}

# ── [T002375-p1] Die real exportierte Harness-Variable ─────────────────#
#
# Der Test oben (T001268-M1) setzt CLAUDE_SESSION_ID SELBST und prueft dann, dass
# sie verwendet wird. Er war jahrelang gruen, waehrend der Mechanismus in der
# echten Umgebung nie griff: die Claude-Code-Harness exportiert
# CLAUDE_CODE_SESSION_ID. Nachweis:
#   env | grep -c '^CLAUDE_SESSION_ID='       -> 0
#   env | grep -c '^CLAUDE_CODE_SESSION_ID='  -> 1
# Ein Test, der seine eigene Vorbedingung herstellt, misst nichts. Die folgenden
# setzen deshalb ausschliesslich die real exportierte Variable.

@test "T002375-p1: _my_sid nutzt CLAUDE_CODE_SESSION_ID, wenn CLAUDE_SESSION_ID ungesetzt ist" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset AGENT_LOCK_SID CLAUDE_SESSION_ID
  export CLAUDE_CODE_SESSION_ID="harness-real-var-1"
  run bash "$LOCK" claim ticket T002375-p1a --label probe
  [ "$status" -eq 0 ]
  local owner
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T002375-p1a.json")
  rm -rf "$AGENT_LOCK_DIR"
  [ "$owner" = "harness-real-var-1" ] || { echo "owner_sid war '$owner', erwartet 'harness-real-var-1'"; false; }
}

@test "T002375-p1: release gelingt ohne --force ueber die Tool-Call-Grenze hinweg" {
  # DER urspruengliche Befund aus T002325-M3 / T002338-M3 / T002372-M1: claim und
  # release liefen in getrennten bash-Aufrufen, also mit unterschiedlicher
  # Unix-Session-ID. Ohne die Harness-Variable fiel _my_sid auf ps -o sess= durch
  # und die eigene Session galt als fremd — release verlangte --force.
  #
  # Warum das mehr als Bequemlichkeit ist: --force ist genau das Instrument, mit
  # dem man FREMDE, noch lebende Locks abraeumt. Erzwingt der Normalfall es, gewoehnt
  # sich jeder Aufrufer daran und raeumt irgendwann einen echten Fremd-Lock ab.
  #
  # setsid ist hier tragend, nicht Zierde: zwei gewoehnliche `bash -c` erben die
  # Session-ID des Elternprozesses und sind damit IDENTISCH. Ein Test ohne setsid
  # waere auch ohne den Fix gruen — also wertlos. Gemessen: bash -c liefert zweimal
  # dieselbe SID, setsid bash -c zwei verschiedene.
  command -v setsid >/dev/null || skip "setsid nicht verfuegbar — die SID-Differenz waere nicht erzeugbar"
  local ald; ald="$(mktemp -d)"

  local sid_a sid_b
  sid_a=$(setsid bash -c 'ps -o sess= -p $$' </dev/null | tr -d ' ')
  sid_b=$(setsid bash -c 'ps -o sess= -p $$' </dev/null | tr -d ' ')
  [ "$sid_a" != "$sid_b" ] || { rm -rf "$ald"; skip "setsid erzeugt hier keine getrennten Sessions"; }

  run env AGENT_LOCK_DIR="$ald" CLAUDE_CODE_SESSION_ID="boundary-sid" \
    setsid bash -c "unset AGENT_LOCK_SID CLAUDE_SESSION_ID; bash '$LOCK' claim ticket T002375-p1b --label probe" </dev/null
  [ "$status" -eq 0 ] || { rm -rf "$ald"; echo "claim fehlgeschlagen: $output"; false; }

  run env AGENT_LOCK_DIR="$ald" CLAUDE_CODE_SESSION_ID="boundary-sid" \
    setsid bash -c "unset AGENT_LOCK_SID CLAUDE_SESSION_ID; bash '$LOCK' release ticket T002375-p1b" </dev/null
  local rel_status="$status" rel_out="$output"
  rm -rf "$ald"
  [ "$rel_status" -eq 0 ] || { echo "release verlangte --force: $rel_out"; false; }
}

@test "T002375-p1: ein ticket-scoped Claim fuellt branch aus dem HEAD" {
  # cmd_claim fuellte BRANCH nur fuer branch-scoped Claims (die ID IST dort der
  # Branch). Ein ticket-scoped Claim schrieb "branch": "". Der Pre-Commit-Guard aus
  # dev-flow-plan Schritt 5 vergleicht genau dieses Feld mit dem HEAD-Branch und
  # schlug damit IMMER fehl, wenn man den Claim so absetzt wie die Skill ihn
  # dokumentiert. Verschaerfend: claim ist idempotent, ein einmal leer angelegter
  # Lock laesst sich durch erneutes Claimen nicht reparieren.
  #
  # Der Test stellt seine Vorbedingung SELBST her, statt gegen $REPO zu claimen.
  # Ein Actions-Checkout ist detached; dort liefert rev-parse woertlich 'HEAD',
  # und cmd_claim leert das Feld dann absichtlich (siehe Folgetest). Gegen $REPO
  # gemessen war dieser Test deshalb lokal gruen und in CI rot — er mass den
  # Zustand des umgebenden Checkouts mit, nicht nur das Verhalten von claim.
  local ald; ald="$(mktemp -d)"
  local tmprepo; tmprepo="$(mktemp -d)"
  git -C "$tmprepo" init -q -b probe-branch
  git -C "$tmprepo" -c user.email=t@example.invalid -c user.name=t \
    commit -q --allow-empty -m init
  run env AGENT_LOCK_DIR="$ald" CLAUDE_CODE_SESSION_ID="branchfill-sid" \
    bash -c "cd '$tmprepo' && unset AGENT_LOCK_SID CLAUDE_SESSION_ID; bash '$LOCK' claim ticket T002375-p1c --label probe"
  [ "$status" -eq 0 ] || { rm -rf "$ald" "$tmprepo"; echo "claim fehlgeschlagen: $output"; false; }
  local br
  br=$(sed -n 's/.*"branch": *"\([^"]*\)".*/\1/p' "$ald/ticket__T002375-p1c.json")
  rm -rf "$ald" "$tmprepo"
  [ "$br" = "probe-branch" ] || { echo "branch war '$br', erwartet 'probe-branch'"; false; }
}

@test "T002375-p1: bei detached HEAD bleibt branch leer und der Claim laeuft trotzdem" {
  # Das Gegenstueck zum Test darueber, und der Grund, warum dieser nicht einfach
  # 'HEAD' als erwarteten Wert akzeptiert: 'HEAD' ist kein Branchname, sondern die
  # Ausgabe von rev-parse fuer einen Zustand ohne Branch. Als Diagnose-Feld waere er
  # irrefuehrend, deshalb leert cmd_claim ihn. Ohne diesen Test waere die Zeile
  # `[ "$BRANCH" = "HEAD" ] && BRANCH=""` in agent-lock.sh ungedeckt — und der Test
  # oben in einem detached Checkout still vakuos.
  local ald; ald="$(mktemp -d)"
  local tmprepo; tmprepo="$(mktemp -d)"
  git -C "$tmprepo" init -q -b probe-branch
  git -C "$tmprepo" -c user.email=t@example.invalid -c user.name=t \
    commit -q --allow-empty -m init
  git -C "$tmprepo" checkout -q --detach HEAD
  run env AGENT_LOCK_DIR="$ald" CLAUDE_CODE_SESSION_ID="detached-sid" \
    bash -c "cd '$tmprepo' && unset AGENT_LOCK_SID CLAUDE_SESSION_ID; bash '$LOCK' claim ticket T002375-p1d --label probe"
  [ "$status" -eq 0 ] || { rm -rf "$ald" "$tmprepo"; echo "claim scheiterte am detached HEAD: $output"; false; }
  local br
  br=$(sed -n 's/.*"branch": *"\([^"]*\)".*/\1/p' "$ald/ticket__T002375-p1d.json")
  rm -rf "$ald" "$tmprepo"
  [ -z "$br" ] || { echo "branch war '$br', erwartet leer"; false; }
}

@test "T002375-p1: reap laesst einen Lock mit toter PID und nicht-numerischer SID stehen" {
  # T002341-M3: ein Claim aus einem sofort endenden `bash -c` traegt dessen PID als
  # owner_pid; der naechste reap einer Parallelsession raeumte ihn ab. Mit einer
  # nicht-numerischen owner_sid gilt der Halter als lebendig (die SID ist per pgrep
  # nicht pruefbar), und nur die Heartbeat-TTL darf ihn noch abraeumen.
  # Belegt statt angenommen — genau das verlangt der Plan.
  local ald; ald="$(mktemp -d)"
  local dead_pid=999999
  cat > "$ald/ticket__T002375-p1d.json" <<JSON
{
  "scope": "ticket",
  "id": "T002375-p1d",
  "owner_sid": "harness-nonnumeric-sid",
  "owner_pid": $dead_pid,
  "label": "probe",
  "branch": "",
  "worktree": "",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "heartbeat_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
  run env AGENT_LOCK_DIR="$ald" CLAUDE_CODE_SESSION_ID="other-session" \
    bash -c "unset AGENT_LOCK_SID CLAUDE_SESSION_ID; bash '$LOCK' reap"
  local survived=0; [ -f "$ald/ticket__T002375-p1d.json" ] && survived=1
  rm -rf "$ald"
  [ "$survived" -eq 1 ] || { echo "reap hat den Lock einer noch lebenden Fremd-Session abgeraeumt"; false; }
}

@test "T002375-p1: die Guard-Kommandos sind ausgelagert, die Aufrufschnittstelle bleibt" {
  # Extraktion zur S1-Budget-Schaffung. Die beiden externen Aufrufer
  # (.githooks/pre-commit, .githooks/post-checkout) rufen weiterhin
  # `agent-lock.sh guard-*` — sie gehoeren p6 und duerfen sich hier nicht aendern.
  [ -f "$REPO/scripts/agent-lock-guards.sh" ] || { echo "scripts/agent-lock-guards.sh fehlt"; false; }
  run grep -q 'cmd_guard_precommit' "$REPO/scripts/agent-lock-guards.sh"
  [ "$status" -eq 0 ] || { echo "cmd_guard_precommit nicht ausgelagert"; false; }
  run grep -q 'cmd_guard_postcheckout' "$REPO/scripts/agent-lock-guards.sh"
  [ "$status" -eq 0 ] || { echo "cmd_guard_postcheckout nicht ausgelagert"; false; }
  # Dispatch bleibt in agent-lock.sh
  run grep -qE 'guard-precommit' "$LOCK"
  [ "$status" -eq 0 ] || { echo "Dispatch-Eintrag guard-precommit verschwunden"; false; }
  # Die externen Aufrufer sind unangetastet
  run grep -q 'agent-lock.sh' "$REPO/.githooks/pre-commit"
  [ "$status" -eq 0 ]
  # Der Extraktionsbeweis ist, dass die Rümpfe NICHT mehr hier stehen — nicht eine
  # Zeilenzahl. (Der Plan nennt "< 430" als Zwischenstand direkt nach dem Verschieben;
  # danach kommen die eigentlichen Änderungen wieder hinzu. Dauerhaft gilt das
  # S1-Limit .sh = 500.)
  run bash -c "grep -c '^cmd_guard_precommit()' '$LOCK'"
  [ "$output" = "0" ] || { echo "cmd_guard_precommit steht noch in agent-lock.sh"; false; }
  local n; n=$(wc -l < "$LOCK")
  [ "$n" -lt 500 ] || { echo "agent-lock.sh hat $n Zeilen, S1-Limit fuer .sh ist 500"; false; }
}

# ── [T002373-M2] cmd_release auto-releases when owner SID is dead ──────#

@test "T002373-M2: cmd_release gibt Lock ohne --force frei, wenn owner SID tot ist" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_FAKE_ALIVE=""
  # Claim as "session-A"
  export AGENT_LOCK_SID="ghost-sid-99999"
  bash "$LOCK" claim ticket T002373-m2 --label test-release-dead
  [ -f "$AGENT_LOCK_DIR/ticket__T002373-m2.json" ]

  # Switch to "session-B" with dead owner
  export AGENT_LOCK_SID="session-B"
  # AGENT_LOCK_FAKE_ALIVE empty → ghost-sid-99999 is not alive
  run bash "$LOCK" release ticket T002373-m2
  echo "exit: $status output: $output"
  [ "$status" -eq 0 ] || { echo "release should succeed without --force when owner SID is dead"; false; }

  # Lock file must be gone
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002373-m2.json" ]

  rm -rf "$AGENT_LOCK_DIR"
}

@test "T002373-M2: cmd_release verweigert Release ohne --force wenn owner SID lebt" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_FAKE_ALIVE="ghost-sid-99999"
  # Claim as "ghost-sid-99999" (marked alive via fake)
  export AGENT_LOCK_SID="ghost-sid-99999"
  bash "$LOCK" claim ticket T002373-m2b --label test-release-alive
  [ -f "$AGENT_LOCK_DIR/ticket__T002373-m2b.json" ]

  # Switch to different session, owner marked alive
  export AGENT_LOCK_SID="session-C"
  run bash "$LOCK" release ticket T002373-m2b
  [ "$status" -eq 1 ] || { echo "release must fail without --force when owner SID is alive"; false; }

  # Lock file must still exist
  [ -f "$AGENT_LOCK_DIR/ticket__T002373-m2b.json" ]

  # With --force it must succeed
  run bash "$LOCK" release ticket T002373-m2b --force
  [ "$status" -eq 0 ] || { echo "release with --force must succeed"; false; }
  [ ! -f "$AGENT_LOCK_DIR/ticket__T002373-m2b.json" ]

  rm -rf "$AGENT_LOCK_DIR"
}
