---
title: "devflow-main-checkout-guards-T900043 — Implementation Plan"
ticket_id: T900043
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-main-checkout-guards-T900043 — Implementation Plan

_Ticket: T900043_

## File Structure

Neue Testdateien (RED, in dieser Session geschrieben und rot nachgewiesen):

- `tests/spec/agent-skills/check-pr-automerge-fail-closed.bats` (neu, BATS; kein S1-Limit für `.bats`)
- `tests/spec/worktree-divergence-guard/main-sync-optout.bats` (neu, BATS; kein S1-Limit für `.bats`)

Geänderte Dateien (GREEN, je genau ein Task — disjunkte `target_files`, D1):

| `path` | Ist | Restbudget |
| `scripts/check-pr-automerge.sh` | 102 | 698 |
| `scripts/worktree-create.sh` | 615 | 185 |

Weitere geänderte Dateien (Doku/Test-Anpassung, kein S1-Limit für `.md`/`.bats`):

- `.claude/skills/references/dev-flow-execute-phases.md` (Schritt 1.4.7: Call-Site auf `--branch "$BRANCH"`)
- `tests/spec/agent-skills/automerge-preflight-check.bats` (bestehender Bare-Call-Test auf neues Verhalten umstellen)

Plan-Artefakte (diese Änderung, keine Produktionswirkung):

- `openspec/changes/devflow-main-checkout-guards-T900043/specs/agent-skills.md`
- `openspec/changes/devflow-main-checkout-guards-T900043/tasks.md`

S1-Einordnung: `scripts/check-pr-automerge.sh` Ist 102 gegen wirksame Schwelle 800 (nicht gebaselined, `.sh`-Limit) → Restbudget 698; der Fail-closed-Guard wächst um rund 15 Zeilen. `scripts/worktree-create.sh` Ist 615 gegen 800 → Restbudget 185; Opt-out-Parsing, Dirty-Guard und Ankündigung wachsen um rund 45 Zeilen. Beide bleiben deutlich unter der Schwelle — kein Split nötig.

## Task 1 — RED: Failing BATS-Tests (in dieser Session erledigt)

`target_files`: `tests/spec/agent-skills/check-pr-automerge-fail-closed.bats`, `tests/spec/worktree-divergence-guard/main-sync-optout.bats`

Beide Dateien sind geschrieben (eigene Datei pro Vorgang, keine Ticket-Nummer im Namen). Rot-Nachweis auf dem aktuellen Branch:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/check-pr-automerge-fail-closed.bats
# expected: FAIL (rot — 3 von 5 Tests fallen: barer Call rc=2, Kontext-Meldung, phases.md-Call-Site; 2 Positiv-Anker grün)
tests/unit/lib/bats-core/bin/bats tests/spec/worktree-divergence-guard/main-sync-optout.bats
# expected: FAIL (rot — 3 von 4 Tests fallen: Env-Opt-out, Flag-Opt-out, Dirty-fail-closed; 1 Positiv-Anker grün)
```

Konventionen: gh-Stub im PATH statt Ambient-gh, BATS-Testnamen strikt ASCII (vendored Runner wählt Nicht-ASCII-Namen nicht an), `grep -qF --` für Muster mit führendem `-`, Positiv-Anker pro Negativ-Aussage.

## Task 2 — GREEN Befund 2: check-pr-automerge fail-closed + Call-Site

`target_files`: `scripts/check-pr-automerge.sh`, `.claude/skills/references/dev-flow-execute-phases.md`, `tests/spec/agent-skills/automerge-preflight-check.bats`

1. In `scripts/check-pr-automerge.sh`: Nach dem Argument-Parsing, vor dem `gh`-Verfügbarkeitscheck, baren Aufruf (weder `--pr` noch `--branch`) mit Fehlermeldung (nennt `--pr`/`--branch`) und Exit 2 abbrechen. Kein Env-Override — der Kontext ist pro Aufruf zu bestimmen. Bestehendes `--pr`/`--branch`-Verhalten unverändert (rc 0/1/2 wie bisher).
2. In `.claude/skills/references/dev-flow-execute-phases.md` Schritt 1.4.7: `bash scripts/check-pr-automerge.sh` → `bash scripts/check-pr-automerge.sh --branch "$BRANCH"` (wie SKILL.md Schritt 3.8 seit T900040). rc-Semantik-Zeilen unverändert.
3. In `tests/spec/agent-skills/automerge-preflight-check.bats`: Den bestehenden Test `kein PR für den Branch → rc=0` auf expliziten Kontext umstellen (`--branch`-Call) — der bare Call ist nach dem Fix rc=2 und würde die Suite sonst rot färben. Keine neue Datei, nur Anpassung an das neue Verhalten.

Verifikation: Die Task-1-Datei `check-pr-automerge-fail-closed.bats` wird vollständig grün (5/5), `automerge-preflight-check.bats` bleibt grün.

## Task 3 — GREEN Befund 4: worktree-create Opt-out-Vertrag

`target_files`: `scripts/worktree-create.sh`

1. Leading-Flag `--no-main-sync` parsen (Positions-Klasse wie `--unattended`, als erstes Argument) plus Env `DEVFLOW_NO_MAIN_SYNC=1` (beide wirken identisch).
2. Im Divergence-Guard (`origin/main` behind-Pfad): Bei gesetztem Opt-out den main-mutierenden Schritt vollständig überspringen (kein `pull --rebase`, kein Stash-Touch), Worktree-Erstellung aus der unveränderten Basis fortsetzen, Überspringen mit Opt-out-Namen melden.
3. Ohne Opt-out und mit dirty Baum (`git diff --quiet HEAD` false): fail-closed abbrechen (Exit ungleich 0, nennt den dirty Zustand) — VOR Stash/Pull/Pop, Baum und Stash bleiben unberührt. Der bisherige Auto-Stash-Pfad für diesen Fall entfällt.
4. Ohne Opt-out und mit cleanem Baum: Sync VOR der Ausführung ankündigen (Branch und Richtung), danach wie bisher ausführen (bestehende `local main synced to origin/main`-Meldung bleibt erster Klasse erhalten).

Reflog-Herkunft (Verifikation aus der Plan-Session): Einziger `pull --rebase (finish): refs/heads/main onto …`-Eintrag vom 2026-09-02 20:38:07 +0200, direkt nach zwei lokalen `[T000000]`-Commits; `devflow-post-merge-finalize.sh` und `branch-reaper.sh` enthalten grep-belegt kein pull/rebase — finalize/branch-reaper erhalten bewusst keinen Sync-Vertrag.

Verifikation: Die Task-1-Datei `main-sync-optout.bats` wird vollständig grün (4/4), `tests/spec/worktree-divergence-guard/` bleibt grün.

## Task 4 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu: `task test:inventory` nach den Test-Datei-Neuzugängen aus Task 1 regenerieren und `components/website/src/data/test-inventory.json` mitcommitten; `plan-lint` über diese Datei muss PASS melden; kein Push, kein Merge, kein Deploy aus dieser Plan-Session (Orchestrator-Order) — `stage-plan` läuft mit `--hold`, der Branch-Lock bleibt bestehen.
