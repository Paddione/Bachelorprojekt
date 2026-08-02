---
title: "mishap-consolidation-T002375 — Implementation Plan"
ticket_id: T002375
domains: [agent-config, devtooling, test, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-consolidation-T002375 — Implementation Plan

_Ticket: T002375 (Epic)_

Fasst 12 offene Mishap-Bundles (rund 33 Einzel-Frictions) in sieben Partials zusammen.
Spec: `openspec/changes/mishap-consolidation-T002375/design.md` ·
Delta: `openspec/changes/mishap-consolidation-T002375/specs/active-sessions-hub.md` ·
Herleitung des Schnitts und der vier Entscheidungen: `design.md` § Entscheidungen.

## File Structure

| Datei | Änderung | Partial |
|---|---|---|
| `scripts/agent-lock.sh` | `_my_sid` akzeptiert `CLAUDE_CODE_SESSION_ID`; `cmd_claim` füllt ein leeres `branch` aus dem HEAD des Claim-Worktrees; die beiden Guard-Kommandos wandern in eine eigene Datei (S1-Budget) | p1 |
| `scripts/agent-lock-guards.sh` | **neu** — `cmd_guard_precommit` und `cmd_guard_postcheckout`, aus `agent-lock.sh` extrahiert | p1 |
| `tests/spec/active-sessions-hub.bats` | Tests aus dem absorbierten T002363-Commit plus Branch-Auto-Fill und Release-über-Tool-Call-Grenze | p1 |
| `tests/spec/agent-lock-session-identity.bats` | der bestehende Scheintest wird durch einen ersetzt, der die Variable **nicht** selbst setzt | p1 |
| `scripts/hooks/worktree-write-guard.sh` | **neu** — `PreToolUse`-Hook, der Schreibzugriffe außerhalb des geclaimten Worktrees ablehnt | p2 |
| `.claude/settings.json` | Hook-Registrierung auf die dateischreibenden Tools | p2 |
| `.claude/skills/references/ci-fix-loop.md` | `devflow-ci-watch.sh` als **synchron aufzurufend** markieren | p2 |
| `tests/spec/dev-flow-plan.bats` | Tests für den Hook (erlaubt / abgelehnt / kein Claim / Bypass) | p2 |
| `scripts/vda/ticket/stage-plan.sh` | `--plan-file` als Alias auf `--plan`; unbekanntes Flag nennt die gültige Liste | p3 |
| `.claude/skills/references/ticket-stage-procedure.md` | Flag-Liste gegen das Skript abgeglichen; `--partials` als Pflichtfeld; `--hold` als Warnung statt Randnotiz; `${PIPESTATUS[0]}`-Hinweis | p3 |
| `.claude/skills/references/mcp-tool-guide.md` | Port-Forward-Integritätswarnung (T002371) | p3 |
| `tests/spec/ticket-system.bats` | Alias-Akzeptanz und Fehlermeldungs-Inhalt | p3 |
| `scripts/code-quality/emit-index.mjs` | untracked-aber-nicht-ignorierte Dateien mitzählen, damit `freshness:check` nicht zwei Runden braucht | p4 |
| `Taskfile.yml` | `test:changed` prüft `localhost:4321` auf Erreichbarkeit und überspringt `test:e2e:services` mit sichtbarer Meldung; `freshness:check` unterscheidet "stale" von "regeneriert, aber nicht committet" | p4 |
| `.claude/skills/references/verification-block.md` | beide Fälle benannt | p4 |
| `tests/spec/ci-cd.bats` | Tests für Reachability-Skip und die unterschiedenen Meldungen | p4 |
| `scripts/openspec.sh` | `propose --resume`: nur fehlende oder erkennbar unausgefüllte Dateien seeden; der Abbruch ohne `--resume` meldet je Datei "Skelett" gegen "befüllt" | p5 |
| `scripts/factory/reconcile-ticket-status.sh` | ein Ticket mit `plan_ref` wird nur dann auf `in_progress` gehoben, wenn auf dem Branch Production-Code liegt | p5 |
| `.claude/skills/references/plan-archive-steps.md` | Delta-Disziplin: die SSOT wird im Change **nicht** direkt editiert | p5 |
| `tests/spec/openspec-workflow.bats` | Resume-Pfad und Statusübergangs-Bedingung | p5 |
| `CLAUDE.md` | `plan-frontmatter-hook.sh` durch `scripts/vda.sh frontmatter` ersetzen; BATS-Konventionsblock um CRLF- und Positiv-Anker-Regel ergänzen | p6 |
| `scripts/batch-workflow-gen.sh` | `chore(batch)` → `chore(factory)`; der Scope ist bereits registriert | p6 |
| `scripts/brain-ingest.sh` | `chore(ingest)` → `chore(agents)`; Sub-Scope `knowledge-ingest` trifft den Zweck | p6 |
| `scripts/plan-lint.sh` | W3 erkennt `datei.sh:6-31`-Referenzen | p6 |
| `.githooks/pre-commit` | Branch-Naming-Meldung nennt die Großschreibung der Ticket-ID; die Kollisionswarnung schließt nicht mehr von einer geteilten generierten Datei auf den ganzen Commit | p6 |
| `.claude/skills/references/ticket-ops-procedures.md` | `AND is_test_data = false` in die Phase-1-Query; Beschreibungen vor dem Dispatch ungekürzt lesen | p6 |
| `scripts/factory/pipeline.js` | **gelöscht** — tote Dublette von `pipeline.mjs` | p7 |
| `scripts/factory/eval-replay.mjs` | einziger Abhänger, auf `pipeline.mjs` umgestellt | p7 |
| `docs/code-quality/gates.yaml` | `s1.ignore`-Eintrag für `pipeline.js` entfällt | p7 |
| `tests/spec/software-factory.bats` | `PIPELINE_SCRIPT` und `PJS` auf `pipeline.mjs`; Scheintest aus T002350 durch eine Verhaltensprüfung ersetzen | p7 |
| `tests/spec/mcp-gateway.bats` | Positiv-Anker vor jeder Negativ-Assertion | p7 |
| `tests/spec/llm-pipeline.bats` | CRLF-tolerante `$`-Anker auf `.ps1`-Guards | p7 |
| `website/src/data/test-inventory.json` | regeneriert nach den Test-Änderungen | p7 |

## Partials

| id | Plan | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-session-identity.md` | impl | `scripts/agent-lock.sh`, `scripts/agent-lock-guards.sh`, `tests/spec/active-sessions-hub.bats`, `tests/spec/agent-lock-session-identity.bats` | |
| p2 | `tasks.d/p2-worktree-guard.md` | impl | `scripts/hooks/worktree-write-guard.sh`, `.claude/settings.json`, `.claude/skills/references/ci-fix-loop.md`, `tests/spec/dev-flow-plan.bats` | p1 |
| p3 | `tasks.d/p3-cli-flags.md` | impl | `scripts/vda/ticket/stage-plan.sh`, `.claude/skills/references/ticket-stage-procedure.md`, `.claude/skills/references/mcp-tool-guide.md`, `tests/spec/ticket-system.bats` | |
| p4 | `tasks.d/p4-freshness.md` | impl | `scripts/code-quality/emit-index.mjs`, `Taskfile.yml`, `.claude/skills/references/verification-block.md`, `tests/spec/ci-cd.bats` | |
| p5 | `tasks.d/p5-openspec-lifecycle.md` | impl | `scripts/openspec.sh`, `scripts/factory/reconcile-ticket-status.sh`, `.claude/skills/references/plan-archive-steps.md`, `tests/spec/openspec-workflow.bats` | |
| p6 | `tasks.d/p6-convention-drift.md` | impl | `CLAUDE.md`, `scripts/batch-workflow-gen.sh`, `scripts/brain-ingest.sh`, `scripts/plan-lint.sh`, `.githooks/pre-commit`, `.claude/skills/references/ticket-ops-procedures.md` | |
| p7 | `tasks.d/p7-test-substance.md` | tests | `scripts/factory/pipeline.js`, `scripts/factory/eval-replay.mjs`, `docs/code-quality/gates.yaml`, `tests/spec/software-factory.bats`, `tests/spec/mcp-gateway.bats`, `tests/spec/llm-pipeline.bats`, `website/src/data/test-inventory.json` | p1, p2, p3, p4, p5, p6 |

`p2` hängt an `p1`, weil der Hook die Lock-Dateien liest, die `p1` erst korrekt befüllt — ohne das
`branch`- und `worktree`-Feld aus `p1` hat der Hook keine verlässliche Grundlage. `p3` bis `p6`
sind untereinander und gegenüber `p1` unabhängig und laufen parallel. `p7` hängt an allen, weil es
die Test-Substanz über den gesamten Change prüft.

Die Dateien sind paarweise disjunkt (`plan-lint` D1). Insbesondere gehört `tests/spec/` **nicht**
pauschal `p7`: jedes Impl-Partial besitzt seine eigene Spec-Datei, `p7` besitzt nur die drei
Dateien, in denen die Test-Substanz selbst der Befund ist.

### S1-Budgets (wirksame Schwelle, kein Baseline-Eintrag vorhanden)

Spaltenfolge bewusst `Datei | ist | Budget`, weil `plan-lint` B1a (`scripts/plan-lint.sh:296`) das
Budget aus der **dritten** Zelle einer Zeile liest. Das Limit steht deshalb hinten.

| Datei | ist | Budget | Limit | Bewertung |
|---|---|---|---|---|
| `scripts/agent-lock.sh` | 464 | 36 | 500 (`.sh`) | **kritisch** — der absorbierte T002363-Commit bringt allein +19 mit. Deshalb enthält `p1` einen echten Extraktionsschritt: `cmd_guard_precommit` (20 Z.) und `cmd_guard_postcheckout` (22 Z.) wandern nach `scripts/agent-lock-guards.sh`. Nach der Extraktion rund 426 Zeilen, Budget rund 74. |
| `scripts/vda/ticket/stage-plan.sh` | 103 | 397 | 500 | unkritisch |
| `scripts/openspec.sh` | 218 | 282 | 500 | unkritisch |
| `scripts/plan-lint.sh` | 395 | 105 | 500 | ausreichend — W3 ist eine Regex-Anpassung, keine neue Funktion |
| `scripts/code-quality/emit-index.mjs` | 56 | 444 | 500 (`.mjs`) | unkritisch |
| `scripts/factory/eval-replay.mjs` | 122 | 378 | 500 | unkritisch |

Die beiden neuen Dateien `scripts/agent-lock-guards.sh` (p1) und
`scripts/hooks/worktree-write-guard.sh` (p2) starten bei 0 Zeilen gegen das `.sh`-Limit von 500;
`p1` verschiebt rund 42 bestehende Zeilen in die erste, `p2` schreibt die zweite neu. Beide bleiben
mit großem Abstand unter der Schwelle.

`commitlint.config.cjs` steht **nicht** in der Liste: die Recon hat ergeben, dass `factory`,
`agents` und `docs` bereits in `namedScopes` registriert sind. Der Defekt aus T002342-M3 liegt in
den zwei aufrufenden Skripten, nicht in der Allowlist — die Datei wird nicht angefasst.

`Taskfile.yml`, `CLAUDE.md`, `.githooks/pre-commit` (ohne Endung) und alle `.bats`-Dateien tragen
kein S1-Limit (`docs/code-quality/gates.yaml` § `s1.limits` führt weder `.yml`, `.md`, `.bats` noch
endungslose Dateien).

<!-- vitest: kein neuer Test nötig — der Change berührt keine Datei unter `website/src/lib/**` oder `website/src/pages/api/**`; die Verifikation läuft vollständig über BATS. -->

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die neuen Tests aus `p1` und `p7` gegen den unveränderten
      Stand laufen lassen. Sie müssen fehlschlagen — das ist der Nachweis, dass sie den realen
      Defekt sehen und nicht bloß tautologisch grün sind. `p1` scheitert, weil `_my_sid` die
      exportierte Harness-Variable nicht kennt und ein ticket-scoped Claim `branch=""` schreibt;
      `p7` scheitert, weil `PIPELINE_SCRIPT` noch auf die tote `pipeline.js` zeigt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats tests/spec/active-sessions-hub.bats
# expected: FAIL (rot — _my_sid liest CLAUDE_SESSION_ID, das die Harness nie exportiert)
```

- [ ] **Fix-Step (GREEN).** `p1` bis `p6` umsetzen, danach `p7`. Anschließend muss derselbe Aufruf
      durchlaufen, ebenso die Suiten der übrigen Partials.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats tests/spec/active-sessions-hub.bats
# erwartet: alle @test gruen
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich explizit, weil nicht alle betroffenen Prüfungen in `test:changed` liegen:

```bash
bash scripts/openspec.sh validate
task test:inventory
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

- [ ] **Verifizieren-und-schließen (kein Code).** Drei Mishaps gelten als bereits behoben durch
      `600be89a1` [T002366]. Vor dem PR wird das nachgewiesen, statt es zu glauben:

```bash
timeout 60 bash scripts/ticket.sh release-hold --id T002375 ; echo "exit=$?"
# erwartet: Rueckkehr deutlich unter 60s, Exit 0 — kein Haenger mehr (T002325-M1, T002341-M1, T002364-M2)
```

**Akzeptanz:**

- `tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub.bats` endet mit Exit 0.
- Ein ticket-scoped Claim ohne `--branch` schreibt ein nicht-leeres `branch`-Feld:
  `jq -re '.branch != ""' "$(git rev-parse --git-common-dir)/agent-locks/ticket__<ID>.json"`.
- `claim` und ein **späterer, separater** `release`-Aufruf derselben Session laufen ohne `--force`
  durch.
- `git ls-files scripts/factory/pipeline.js` liefert keine Zeile — die Dublette ist weg.
- `grep -c 'pipeline\.js' tests/spec/software-factory.bats scripts/factory/eval-replay.mjs
  docs/code-quality/gates.yaml` liefert für jede Datei `0`.
- `wc -l < scripts/agent-lock.sh` liegt unter `500`.
- `grep -c 'plan-frontmatter-hook' CLAUDE.md` liefert `0`.
- `bash scripts/openspec.sh validate` endet mit Exit 0.
- `task freshness:check` endet mit Exit 0 **im ersten Lauf nach einem `git add`** — der zweite
  Durchgang aus T002273-M1 entfällt.
- Alle 12 umfassten Tickets stehen nach dem Merge auf `done`; die drei bereits von T002366
  behobenen tragen im Abschluss-Kommentar den Verweis auf `600be89a1`.
