---
title: "test-guard-semantics — Implementation Plan"
ticket_id: T003796
domains: [test, agent-skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# test-guard-semantics — Implementation Plan

_Ticket: T003796_

## File Structure

```
CLAUDE.md                                               (p1 — T002716 auf vier Spielarten erweitern; Ist 266 - Baseline 0 -> Budget 234)
docs/superpowers/references/gotchas-footguns.md         (p1 — Langfassung der Faelle; Ist 305 - Baseline 0 -> Budget 195)
tests/spec/openspec-workflow/ticket-file-required.bats  (p2 — Scoping auf PR-Diff; Ist 66 - Baseline 0 -> Budget 734)
tests/spec/sdlc-cockpit/redesign-struktur.bats          (p2 — Import-Statements statt nacktem String; Ist 106 - Baseline 0 -> Budget 694)
tests/spec/local-llm-proxy.bats                         (p2 — Request statt Quelltext-Grep; Ist 454 - Baseline 0 -> Budget 346)
tests/spec/agent-skills/guard-semantics-konvention.bats (p4 — neue Datei, Konventions-Guard; Ist 0 - Baseline 0 -> Budget 800)
```

p3 beruehrt zusaetzlich die folgenden 23 Bestandsdateien (Audit, gezielte Reparatur). Sie stehen
hier einzeln statt als Glob, weil `plan-touched-files.sh` diese Sektion auswertet und ein Glob dort
woertlich uebernommen wird — als `touched_files`-Eintrag ist `tests/spec/**` wertlos. Alle liegen
unter dem 800-Zeilen-Limit fuer `.bats`; die Aenderungen sind lokale Umformulierungen einzelner
Assertions.

```
tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats
tests/spec/agent-skills/worktree-mid-rebase-guard.bats
tests/spec/ci-cd.bats
tests/spec/dev-flow-chore-ticket-ops-mishaps.bats
tests/spec/dev-flow-plan.bats
tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats
tests/spec/devflow-selection-archive-hardening.bats
tests/spec/local-llm-proxy/loadout-env-property.bats
tests/spec/mcp-gateway/bge-host-routing.bats
tests/spec/mishap-categorize-erden.bats
tests/spec/openspec-workflow.bats
tests/spec/openspec-workflow/half-archive-uncommitted.bats
tests/spec/react-login-edit-homepage.bats
tests/spec/repo-hygiene/signal-gaps.bats
tests/spec/repo-hygiene/worktree-stash-inspection.bats
tests/spec/sdlc-isolation/e3-poller.bats
tests/spec/sdlc-isolation/sdlc-up-command.bats
tests/spec/software-factory/catalog-eval-telemetry.bats
tests/spec/software-factory/dashboard.bats
tests/spec/software-factory/pipeline-and-ticket-cli.bats
tests/spec/software-factory/ticket-lifecycle.bats
tests/spec/ticket-system.bats
tests/spec/website-core.bats
```

Keine der Dateien hat einen Eintrag in `docs/code-quality/baseline.json`; die wirksame Schwelle ist
jeweils das Limit (800 Zeilen fuer `.bats`, 500 fuer Markdown). Alle liegen darunter, kein
Verkleinerungsschritt noetig. **Eng wird es nur bei `gotchas-footguns.md`:** 305 von 500, und p1
haengt vier Langfassungen an. Bleibt unter 195 neuen Zeilen — sonst gehoert der Ueberhang in eine
eigene Referenzdatei statt in eine Verkleinerung des Bestands.

Gemessen gegen `origin/main` am 2026-08-11:

```bash
for f in CLAUDE.md docs/superpowers/references/gotchas-footguns.md \
         tests/spec/openspec-workflow/ticket-file-required.bats \
         tests/spec/sdlc-cockpit/redesign-struktur.bats \
         tests/spec/local-llm-proxy.bats; do
  printf '%-58s %s\n' "$f" "$(git show origin/main:$f | wc -l)"
done
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-konvention.md` | impl | `CLAUDE.md`, `docs/superpowers/references/gotchas-footguns.md` | |
| p2 | `tasks.d/p2-guards-gezielt.md` | impl | `tests/spec/openspec-workflow/ticket-file-required.bats`, `tests/spec/sdlc-cockpit/redesign-struktur.bats`, `tests/spec/local-llm-proxy.bats` | |
| p3 | `tasks.d/p3-sweep.md` | impl | `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats`, `tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats`, `tests/spec/agent-skills/worktree-mid-rebase-guard.bats`, `tests/spec/ci-cd.bats`, `tests/spec/dev-flow-plan.bats`, `tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats`, `tests/spec/devflow-selection-archive-hardening.bats`, `tests/spec/local-llm-proxy/loadout-env-property.bats`, `tests/spec/mcp-gateway/bge-host-routing.bats`, `tests/spec/mishap-categorize-erden.bats`, `tests/spec/openspec-workflow.bats`, `tests/spec/openspec-workflow/half-archive-uncommitted.bats`, `tests/spec/react-login-edit-homepage.bats`, `tests/spec/repo-hygiene/signal-gaps.bats`, `tests/spec/repo-hygiene/worktree-stash-inspection.bats`, `tests/spec/sdlc-isolation/e3-poller.bats`, `tests/spec/sdlc-isolation/sdlc-up-command.bats`, `tests/spec/software-factory/catalog-eval-telemetry.bats`, `tests/spec/software-factory/dashboard.bats`, `tests/spec/software-factory/pipeline-and-ticket-cli.bats`, `tests/spec/software-factory/ticket-lifecycle.bats`, `tests/spec/ticket-system.bats`, `tests/spec/website-core.bats` | |
| p4 | `tasks.d/p4-tests.md` | tests | `tests/spec/agent-skills/guard-semantics-konvention.bats` | p1, p2, p3 |

Die Dateimengen sind disjunkt (D1). Eine scheinbare Ueberschneidung ist keine: p3 beruehrt
`tests/spec/local-llm-proxy/loadout-env-property.bats` (Verzeichnisform), p2 dagegen
`tests/spec/local-llm-proxy.bats` (Sammeldatei) — zwei verschiedene Dateien. Ebenso bei
`tests/spec/agent-skills/`: p3 aendert die Bestandsdatei `worktree-mid-rebase-guard.bats`, p4 legt
daneben eine neue an. Beide Testformen sind gleichzeitig gueltig und muessen bei jeder Suche
zusammen erfasst werden (T002696).

p3 listet alle 23 Fundstellen als `target_files`, obwohl vorab nicht feststeht, welche davon
tatsaechlich repariert werden — das entscheidet erst die Pruefung je Fundstelle. Die vollstaendige
Liste steht hier, damit der Umfang sichtbar ist und keine Datei ausserhalb dieses Partials
angefasst wird.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Nachweis haengt an `p4`. Lege
      `tests/spec/agent-skills/guard-semantics-konvention.bats` an. Der Test prueft **command
      output** (T002448-M4), nicht den Quelltext, ausser bei den beiden Doku-Zusicherungen — die
      manifestieren sich ausschliesslich im Text und sind damit der dokumentierte Ausnahmefall.

      Faelle:
      1. **Options-Parsing (T003108), ausfuehrbar:** `grep -qF '--draft'` gegen einen Text, der
         `--draft` enthaelt, endet mit Exit **2**; mit `-e` mit Exit **0**. Beide Richtungen
         zusichern — der Test belegt damit die Regel, nicht nur ihre Erwaehnung.
      2. **Positions-Guard (T003104), ausfuehrbar:** ein Fixture-Dokument mit dem Suchbegriff in
         `## 3.` und der gemeinten Regel in `## 4.`. Die bereichsbeschraenkte Suche findet die
         Regel, die dokumentweite `head -1`-Suche nicht. Der Test faellt um, wenn jemand auf die
         dokumentweite Form zurueckwechselt.
      3. **Konventionstext (Drift-Schutz):** CLAUDE.md nennt alle vier Spielarten. Reiner
         Textabgleich, bewusst als Ausnahme markiert und im Dateikopf begruendet.

      **Positiv-Anker in jedem Negativfall (T002356-M1):** Zuerst pruefen, dass der gueltige Fall
      durchlaeuft, dann die Negativaussage. Ohne den Anker ist "0 Treffer" nicht von "Ausdruck
      kaputt" unterscheidbar — genau der Fehler, den dieser Vorgang behebt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/guard-semantics-konvention.bats
# expected: FAIL (rot — Konventionstext und reparierte Guards existieren noch nicht)
```

- [ ] **p1 — Konvention erweitern.** Details in `tasks.d/p1-konvention.md`.
- [ ] **p2 — Drei Guards reparieren.** Details in `tasks.d/p2-guards-gezielt.md`.
- [ ] **p3 — Audit der 23 Dateien.** Details in `tasks.d/p3-sweep.md`.
- [ ] **p4 — Konventions-Guard.** Details in `tasks.d/p4-tests.md`.

- [ ] **Gegenprobe: beide Testformen erfassen (T002696).** Eine gezielte Suche nach
      `tests/spec/<spec>.bats` findet nur die Haelfte des Bestands. Am Ende beide Formen laufen
      lassen, sonst faellt eine Luecke erst in CI auf:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills tests/spec/openspec-workflow
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
