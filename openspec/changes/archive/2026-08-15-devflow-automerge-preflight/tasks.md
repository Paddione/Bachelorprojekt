---
title: "devflow-automerge-preflight — Implementation Plan"
ticket_id: T006366
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-automerge-preflight — Implementation Plan

_Ticket: T006366_

## File Structure

```
openspec/changes/devflow-automerge-preflight/specs/agent-skills.md   (neu — Delta auf agent-skills.md, Teil dieses Stage-Commits)
tests/spec/agent-skills/automerge-preflight-check.bats               (neu — failing Test, Teil dieses Stage-Commits)
scripts/check-pr-automerge.sh                                        (neu, ~70 Zeilen; .sh-Limit 800 → Budget großzügig)
.claude/skills/dev-flow-execute/SKILL.md                             (352 Ist, kein S1-Limit → +~12 Zeilen in Schritt 3.8)
.claude/skills/references/dev-flow-execute-phases.md                 (362 Ist, kein S1-Limit → +~15 Zeilen neuer Pre-Flight-Schritt)
```

## Verify (RED → GREEN)

### Task 1 — RED: Failing Test nachweisen

Der failing Test `tests/spec/agent-skills/automerge-preflight-check.bats` ist mit diesem
Stage-Commit eingecheckt. Er reproduziert die Fehlerklasse aus T006282 (extern
aktivierter Auto-Merge ist für dev-flow-execute unsichtbar): `scripts/check-pr-automerge.sh`
existiert nicht (rc=127), und SKILL.md/phases.md referenzieren den Check nirgends.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-preflight-check.bats
# expected: FAIL — alle 6 Tests rot (4 Script-Verhalten: Skript fehlt; 2 Integration: Referenz fehlt)
```

### Task 2 — GREEN: `scripts/check-pr-automerge.sh` anlegen

Neue Datei `scripts/check-pr-automerge.sh` (~70 Zeilen, Bash, `set -euo pipefail`,
read-only gegen GitHub):

- Options: `--pr <nummer>` (explizite PR-Nummer), `--branch <name>` (Default: aktueller
  Branch), `-h|--help`.
- Zustandsermittlung: `gh pr view --json number,autoMergeRequest` (mit `--pr N` sofern
  gesetzt), Auswertung via `jq -r '.autoMergeRequest'`.
- Exit-Codes (Design D2/D3):
  - `rc=0`: kein PR für den Branch (gh-stderr enthält "no pull requests found") ODER
    `autoMergeRequest` ist null → "OK"-Meldung auf stdout, fortfahren.
  - `rc=1`: `autoMergeRequest` != null → "BLOCK"-Meldung mit PR-Nummer (aus `.number`),
    fail-closed.
  - `rc=2`: `command -v gh` fehlgeschlagen, Usage-Fehler oder jeder andere
    `gh pr view`-Abbruch (stderr ohne "no pull requests found") — Zustand ungeklärt,
    kein Freibrief als "kein Auto-Merge".

Verifikation: die vier Script-Verhalten-Tests laufen grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-preflight-check.bats
# expected: PASS — 4/4 Script-Tests grün, 2 Integrations-Tests noch rot
```

### Task 3 — GREEN: Integration in SKILL.md und Pre-Flight-Phasen

`.claude/skills/dev-flow-execute/SKILL.md` — Schritt 3.8 (Code-Review-Gate): erster
Gate-Schritt VOR `requesting-code-review` ist der Auto-Merge-Zustandscheck:

```bash
bash scripts/check-pr-automerge.sh
```

- `rc=1`: Gate bricht fail-closed ab — Meldung nennt die PR-Nummer; es wird KEIN
  Review-Ergebnis erteilt und KEIN Auto-Merge deaktiviert (Design D2: der explizite
  User-Akt wird sichtbar, der Operator entscheidet).
- `rc=2`: Abbruch als Umgebungsfehler.

`.claude/skills/references/dev-flow-execute-phases.md` — neuer Pre-Flight-Schritt direkt
nach Schritt 1.4 (Doppelarbeit-Guard), z.B. "Schritt 1.4.7: Auto-Merge-Zustand prüfen":
derselbe Aufruf; `rc=1` → Abbruch als Doppel-Execution-Situation (parallele Session oder
User hat bereits einen PR mit Auto-Merge auf dem Branch → koordinieren, nicht
duplizieren); `rc=2` → Umgebungsfehler.

Verifikation: die beiden Integrations-Guards (Grep auf `check-pr-automerge.sh` im
Gate-Abschnitt der SKILL.md bzw. in phases.md) laufen grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-preflight-check.bats
# expected: PASS — 6/6 Tests grün
```

### Task 4 — Abschluss-Verifikation

Die drei Pflicht-Gates (STRUCT3):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
