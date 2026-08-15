---
title: "mishap-incident-rollup-2026-08-15-T007034 — Implementation Plan"
ticket_id: T007034
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T007034 — Implementation Plan

_Container-Ticket: T007034_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 10:50 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-15 10:49 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | tasks/test:changed | task test:changed lief fremde Changes mit (origin/main zog während der Chore vor) |
> | 2 | drift | factory | Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6) |
> | 3 | drift | skills/ticket-ops | Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel |
> | 4 | process | plan-lint | plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst |
> | 5 | process | dev-flow-plan docs | D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen |
> | 6 | drift | skills/mishap-tracker | Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen" |
> | 7 | suspicious | scripts/factory/mishap-rollup.sh | Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix |
> | 8 | suspicious | skills/git-workflow | Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch |
> | 9 | drift | tickets/merge-closure | T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main |
> | 10 | drift | scripts/devflow-post-merge-finalize.sh | OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht |
> 
> **1. task test:changed lief fremde Changes mit (origin/main zog während der Chore vor)** (suspicious, tasks/test:changed)
> 
> Während der Chore T006997 mergten 2 PRs (#4622 T006842, #4623) auf main. `task test:changed` difft gegen origin/main und lief deshalb die volle Unit/Spec-Suite fremder Changes inkl. Live-Cluster-Test "T003205: /v1/models enthaelt kein bge-Modell" (not ok) — ein roter Hering, der wie ein Fehler der eigenen Änderung aussah. Heilung: Worktree-Branch auf origin/main rebasen, danach war der Diff wieder auf die 4 eigenen Dateien begrenzt und der Lauf grün (Quality-Gate 52/52). Härtungsidee: vor `task test:changed` den Branch-Stand gegen origin/main prüfen (bzw. rebasen), statt einen Fehlversuch zu fahren.
> **2. Factory-Tick startet leer — verwaiste dirty Worktrees blockieren eigene Guard (worktree_failed ×6)** (drift, factory)
> 
> Verifiziert via /tmp/factory-prep-tick2-2074051.json (launch=[], 6× skipped reason=worktree_failed) und factory-prep.sh ~Z.283-291: drei verwaiste Worktrees gestorbener Executoren (devflow-worktree-cwd-guard/T006367, factory-merged-dispatch-gate/T006297, plan-archive-freshness-check/T006369) sind dirty, halten aber keinen Lock — die Dirty-Worktree-Guard überspringt sie bei jedem Tick, niemand räumt sie auf. ticket-ops übernahm die Ausführung; T006367/T006297 wurden Minuten später von der Factory auf in_progress gesetzt (STALE-STATE-Regel T006295 griff, nicht dispatched).
> **3. Doku-Drift: ticket_links kind='pr' mit Self-Link trotz "nie für PR-Referenzen"-Regel** (drift, skills/ticket-ops)
> 
> Verifiziert per SQL: tickets.ticket_links enthält Zeile from=T007000, to=T007000, kind='pr' (geschrieben via add_pr_link). ticket-ops-SKILL.md Invariante sagt "ticket_links ist ticket→ticket, nie für PR-Referenzen" — das Schema erlaubt kind='pr' real. Eines von beiden (Doku oder Tool) sollte nachgezogen werden.
> **4. plan-lint: Partials-Header-Zeile mit tasks.d/-Literal wird als Datenzeile geparst** (process, plan-lint)
> 
> plan-lint.sh parst die Header-Zeile der ## Partials-Tabelle als Datenzeile, sobald sie das Literal tasks.d/ enthält — eine völlig übliche Header-Formulierung ("| id | tasks.d/pX-<name>.md | Rolle | ... |") erzeugte 6 Fehl-Parses (missing partial file, D2-Ghost-Deps, cycle-Fehlalarm). Workaround: Header-Spalte ohne tasks.d/-Literal benennen. Vorschlag: awk-Filter auf Header-Zeilen (erste Zeile nach ## Partials skippen) oder Datenzeilen anhand von impl|tests in Spalte 3 erkennen.
> **5. D2: depends_on-Kurzformen in Skill-Beispielen führen zu plan-lint-Fehlalarmen** (process, dev-flow-plan docs)
> 
> D2 verlangt volle Partial-IDs in depends_on (p1-md-kur), während die Skill-Referenz dev-flow-plan-phases.md in ihrem Pipeline-Beispiel Kurzformen zeigt (--partials N, depends_on-Spalte ohne Beispiele mit vollen IDs). Beim ersten plan-lint-Lauf: 5 D2-Fehler (unknown id p1..p4) + ein Cycle-Fehlalarm durch Spaltenversatz. Workaround: volle IDs verwenden. Vorschlag: Beispiel-Zeile mit vollen IDs in die Referenz aufnehmen.
> **6. Rollup-Container-Zyklus: Container wird pro Batch geschlossen + neu angelegt — Doku sagt „wird niemals geschlossen"** (drift, skills/mishap-tracker)
> 
> Verifiziert per DB (2026-08-15): Rollup-Container T006843 steht auf done/obsolete (09:37Z), direkt danach wurde T007034 als neuer Container angelegt (triage). Der reale Zyklus ist also „ein Container pro Batch, wird nach Verarbeitung geschlossen" — die mishap-tracker-SKILL.md dokumentiert dagegen „Es wird niemals geschlossen" und „im eingeschwungenen Zustand steht er auf plan_staged". Ein Lauf, der den Container nach Doku sucht (status=plan_staged), findet T007034 (triage) nicht. Doku nachziehen oder Zyklus ändern.
> **7. Rollup-Pipeline ~1h blockiert: plan-lint P2 auf Batch-Beispielen + Lock-Leak im cleanup_wt-Trap — Selbstheilung erst nach Generator-Fix** (suspicious, scripts/factory/mishap-rollup.sh)
> 
> Der 10er-Mishap-Batch (2026-08-15 08:47 UTC) auf Container T006843 (korczewski) blieb ~1h unverarbeitet: (1) plan-lint P2 hard-failte auf den unverändert in tasks.md eingebetteten Batch-Kommentaren (feat(llm):/test(llm):-Beispiele aus dem plan-quality-gates-Mishap galten als Commit-Scope-Vorschreibungen), (2) der cleanup_wt-Trap releaste den Branch-Claim aus dem Worktree-cwd — der T006290-cwd-Guard verweigerte das, der Lock leakt, der nächste Driver-Lauf im selben Tick hing am claim, (3) wakeup.sh maskierte die Fehlschleife mit '|| true' (kein Log, Diagnose ~1h). Fix via T007000 (PR #4625): Blockquote-Einbettung des Batch-Inhalts ('> '-Präfix nutzt die P2-Exemption für '>'-Zeilen) + cd "$REPO" vor dem Release. Nach dem Merge entblockte sich der Tick selbst: Plan publiziert, Container geschlossen, Folge-Container T007034 angelegt, Rollup-PR #4627 gemergt. Offen bleibt ein Drittfund: der Generator committet die regenerierte website/src/data/openspec-status.json nicht mit — der Rollup-PR scheiterte erst am CI-Freshness-Gate und brauchte einen manuellen Follow-up-Commit (Kandidat für die nächste Generator-Runde).
> **8. Übernommener Worktree stand auf Scratch-Branch — Commits landeten auf falschem Branch** (suspicious, skills/git-workflow)
> 
> Nach dem Stopp des T006371-Execute-Agenten stand dessen Worktree auf einem fremden Branch (chore/scratch-repro-T006371x, vom gestorbenen Agenten angelegt) statt auf fix/archive-status-staging-guard-T006371. Zwei Commits (Fix + Regen) landeten dadurch auf dem falschen Branch; Push-Aufrufe meldeten trügerisch "Everything up-to-date". Manuell repariert (Branch neu gesetzt, Scratch-Commit per rebase --onto gedroppt, Scratch-Branch gelöscht, korrekter Force-Push). Prävention: vor Commits in einem übernommenen Worktree `git rev-parse --abbrev-ref HEAD` gegen den erwarteten Branch prüfen — T002357-Fallenklasse um die Branch-Dimension erweitert.
> **9. T007035 done/shipped trotz offenem PR #4640 (BLOCKED) — Workflow-Fix nicht auf main** (drift, tickets/merge-closure)
> 
> Verifiziert 2026-08-15: T007035 steht auf done/shipped, aber PR #4640 (chore/cosign-sign-reference-T007035, der cosign-Digest-Fix) ist offen und BLOCKED. Reaper-Beweis: chore/gitops-audit-fixes-T007035 wird mit "abweichende Datei ausserhalb der Allowlist: .github/workflows/render-fleet-artifact.yml" KEEP-gehalten — der Inhalt ist NICHT in main. Close-ohne-Merge (Umkehrung des T006297-Musters). Ticket wird von einer Fremdsession geführt.
> **10. OpenSpec-Archive für manuell gemergte PRs (T006369/T006371) laufen nicht** (drift, scripts/devflow-post-merge-finalize.sh)
> 
> Verifiziert 2026-08-15: T006369 (Merge 10:01Z) und T006371 (Merge ~11:58Z) sind done, aber ihre OpenSpec-Changes liegen noch AKTIV auf origin/main (openspec/changes/plan-archive-freshness-check und archive-status-staging-guard — nicht in archive/), und es existiert kein Archiv-Branch. Beide PRs wurden manuell (ticket-ops/git-workflow) gemergt, nicht über die Factory. Offene Frage: Archiviert der Post-Merge-Finalizer nur Factory-Merges? Falls ja, fehlt der Archiv-Schritt für manuelle Merges im Flow.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
