---
title: "mishap-t002341 — Implementation Plan"
ticket_id: T002341
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002341 — Implementation Plan

_Ticket: T002341_

Mishap-Bundle: tickets, dev-flow (3 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
scripts/vda/ticket/stage-plan.sh
scripts/agent-collision.sh
scripts/agent-lock.sh
tests/spec/ci-cd.bats
```

## Mishap-Eintraege

### Mishap 1: stage-plan haengt >120s ohne Ausgabe, obwohl der Write erfolgreich ist
**Typ:** degraded | **Komponente:** tickets

Bei dev-flow-plan fuer T002328 lief `bash scripts/ticket.sh stage-plan --id T002328 --branch fix/... --plan openspec/changes/.../tasks.md` ueber 120s ohne jede Ausgabe und musste abgebrochen werden. Derselbe Aufruf ueber `mcp__ticket-mcp__stage_plan` hing ebenfalls >120s. Diagnose ergab: Cluster gesund (fleet, 4 Nodes Ready), genau EIN shared-db-Pod im Status Running (also NICHT der bekannte _pgpod-Completed-Pod-Fall), Portforwards 13001/13003/18080 offen, und `pg_stat_activity` zeigte KEINE blockierende oder wartende Transaktion. Der Status wurde trotzdem korrekt geschrieben (T002328 = plan_staged, updated_at 15:21:25) — es haengt also etwas NACH dem eigentlichen DB-Write, ohne Timeout und ohne Fehlermeldung. Auswirkung: der Aufrufer kann nicht unterscheiden zwischen "haengt" und "fehlgeschlagen" und bricht ab, obwohl die Operation gelungen ist. Ein Timeout mit klarer Meldung wuerde reichen.

---

### Mishap 2: Pre-Commit-Kollisionswarnung meldet falsch positiv fuer den gesamten Change-Ordner
**Typ:** suspicious | **Komponente:** dev-flow

Beim Stage-Commit auf fix/commit-scope-consolidation-T002328 meldete der Guard sechs COLLISION-Warnungen — darunter design.md, proposal.md, tasks.md und specs/ci-cd.md aus openspec/changes/commit-scope-consolidation/, also Dateien, die diese Session selbst Minuten zuvor angelegt hatte. Als kollidierende Session wurde claude/mishap-tracker (sid 1342509, worktree .worktrees/mishap-T002339) genannt. Nachpruefung: jener Worktree arbeitet an openspec/changes/mishap-t002339/ und hat mit dem eigenen Change nichts gemein. Die einzige echte Ueberschneidung ist website/src/data/openspec-status.json — ein generiertes Artefakt, das jeder `openspec.sh propose`-Lauf anfasst. Der Detektor schliesst offenbar von dieser einen gemeinsamen generierten Datei auf saemtliche Dateien des Commits. Auswirkung: die Warnung ist unbrauchbar, weil sie bei jedem parallelen propose-Lauf feuert und echte Kollisionen darin untergehen.

---

### Mishap 3: Verwaiste Branch-Locks: PID 1342509 tot, zwei Locks stehen weiter auf live
**Typ:** process | **Komponente:** dev-flow

`agent-lock.sh list` fuehrt zwei Branch-Locks (chore/mishap-T002338 und chore/mishap-T002339, label mishap-tracker) mit sid 1342509 im Zustand live. `ps -p 1342509` liefert keinen Prozess — die Session existiert nicht mehr. `agent-lock.sh reap` lief zu Beginn dieser Session (vor der Entstehung dieser Locks) und hat sie folglich nicht erfasst. Auswirkung: eine nachfolgende Session, die an einem der beiden Branches arbeiten will, bekommt beim Claim ein Exit 1 und haelt eine tote Session faelschlich fuer aktiv. Ich habe die Locks bewusst NICHT geraeumt, weil sie fremder Arbeit gehoeren und der Worktree .worktrees/mishap-T002339 noch ungetrackte Aenderungen enthaelt (openspec/changes/mishap-t002339/) — die waeren bei einem unbedachten Cleanup weg.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
