---
title: "devflow-flow-frictions-T002671 — Implementation Plan"
ticket_id: T002671
domains: [scripts, dev-flow]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-flow-frictions-T002671 — Implementation Plan

_Ticket: T002671_

## Partials

Ein einzelnes Partial genügt — drei Skript-Dateien, disjunkt von jedem anderen offenen Plan,
keine parallele Decompose nötig für einen Umfang dieser Größe.

- p1 (tests + fix): SID-Drift-Fix (`agent-lock-identity.sh` + `agent-lock.sh`) und
  CI-Watch-MERGED-Preflight (`devflow-ci-watch.sh`); beide Reproduktionstests bereits
  geschrieben und RED-verifiziert.

## File Structure

```
tests/spec/active-sessions-hub/opencode-session-id-stable.bats   NEU — RED, bereits geschrieben
tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats                NEU — RED, bereits geschrieben
scripts/agent-lock-identity.sh                                    GEÄNDERT — S1: Ist 82 · Budget 800-82=718
scripts/agent-lock.sh                                              GEÄNDERT — S1: Ist 585 · Budget 800-585=215
scripts/devflow-ci-watch.sh                                        GEÄNDERT — S1: Ist 129 · Budget 800-129=671
openspec/specs/active-sessions-hub.md                              GEÄNDERT (Delta-Merge beim Archiv-Schritt, nicht in dieser PR)
openspec/specs/ci-cd.md                                            GEÄNDERT (Delta-Merge beim Archiv-Schritt, nicht in dieser PR)
```

Alle drei geänderten Skripte haben nach der Änderung (wenige Zeilen Zuwachs) klar Luft unter
ihrer wirksamen Schwelle (statisches `.sh`-Limit 800, keine der drei Dateien ist gebaselined) —
kein Split/Shrink-Schritt nötig.

## Task 1 — RED: Reproduktionstests (bereits geschrieben und verifiziert)

Beide Tests wurden bereits vor diesem Plan geschrieben und lokal gegen den ungefixten Stand
ausgeführt — Positiv-Anker grün, Negativfall rot, wie erwartet:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/opencode-session-id-stable.bats
# expected: FAIL — 3 von 5 Tests rot (Positiv-Anker "AGENT_LOCK_SID"/"CLAUDE_CODE_SESSION_ID"
# bleiben grün; die drei OPENCODE_SESSION_ID-Fälle sind rot, weil die Allowlist die Variable
# noch nicht kennt)

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# expected: FAIL — 1 von 2 Tests rot (Positiv-Anker "OPEN erreicht --watch" bleibt grün; der
# MERGED-Fall ist rot, weil devflow-ci-watch.sh den blockierenden --watch-Call trotzdem erreicht)
```

Kein weiterer Schritt nötig für Task 1 — beide Dateien liegen bereits im Worktree.

## Task 2 — GREEN: `OPENCODE_SESSION_ID` in die Session-Identity-Allowlist aufnehmen

Ziel: `tests/spec/active-sessions-hub/opencode-session-id-stable.bats` wird vollständig grün.

1. In `scripts/agent-lock-identity.sh`:
   - `_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID"` →
     `_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID OPENCODE_SESSION_ID"`.
   - In `_detect_tool`: vor dem bestehenden `if [ -n "${_sid_env}${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude`
     einen neuen, spezifischeren Zweig einfügen: `if [ -n "${OPENCODE_SESSION_ID:-}" ]; then echo opencode; return; fi`
     — MUSS vor dem generischen `_sid_env`-Zweig stehen, sonst klassifiziert der generische
     Zweig eine opencode-Session weiterhin als `claude`, weil `_sid_env` jetzt auch für
     `OPENCODE_SESSION_ID` wahr wird.
2. In `scripts/agent-lock.sh` (Kopf-Kopie, Zeile ~19): dieselbe Änderung an
   `_AGENT_LOCK_SID_ENVS` spiegeln. Diese Kopf-Definition wird zur Laufzeit vom späteren
   `source agent-lock-identity.sh`-Loader (Zeile ~559) überschrieben, bleibt aber als
   Diagnose-Quelle für die Warnmeldung "weder CLAUDE_CODE_SESSION_ID/CLAUDE_SESSION_ID noch
   AGENT_LOCK_SID gesetzt" bestehen — ohne Sync driftet die Warnmeldung erneut vom
   tatsächlichen Verhalten weg. Das Testszenario "agent-lock.sh claim records the stable
   OPENCODE_SESSION_ID" prüft explizit den End-to-End-`claim`-Pfad und deckt beide Listen ab.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/opencode-session-id-stable.bats
# expected: alle 5 Tests grün
```

## Task 3 — GREEN: `devflow-ci-watch.sh` MERGED-Preflight

Ziel: `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats` wird vollständig grün.

In `scripts/devflow-ci-watch.sh`, direkt nach dem bestehenden CONFLICTING-Preflight (nach
Zeile 51, vor `CI_ATTEMPT=0` / der `while true`-Schleife) einfügen:

```bash
# Preflight: a PR that is already MERGED never needs (re-)polling — its checks
# were, by branch-protection definition, already green. Without this check the
# loop's first action is the BLOCKING `gh pr checks --watch` call, which can
# hang indefinitely against a closed PR (observed T002628/T002671).
PR_STATE=$(gh pr view "$PR_URL" --json state -q '.state' 2>/dev/null || echo "")
if [[ "$PR_STATE" == "MERGED" ]]; then
  echo "✅ PR bereits gemergt (state=MERGED) — Checks waren per Branch-Protection bereits grün. Überspringe Poll-Loop."
  if ! ./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"; then
    echo "❌ Phase-Chain nicht vollständig — siehe Meldungen oben." >&2
    exit 6
  fi
  exit 0
fi
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# expected: beide Tests grün
```

## Verify (RED → GREEN)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/opencode-session-id-stable.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
task test:changed
task freshness:regenerate
task freshness:check
```
