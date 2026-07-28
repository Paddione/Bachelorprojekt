---
title: "mishap-t002374 — Implementation Plan"
ticket_id: T002374
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002374 — Implementation Plan

_Ticket: T002374_

Mishap-Bundle: scripts/validate-commit-msg.sh, scripts/agent-lock.sh (2 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: commit-msg scope 'skills' abgelehnt — Konsolidierung zu 'agents' nicht in Chore-Skill-Doku erwähnt
**Typ:** drift | **Komponente:** scripts/validate-commit-msg.sh

Beim Chore T002253 (Doku-Ergänzung in .claude/skills/git-workflow/SKILL.md) wurde der naheliegende Commit-Scope 'skills' von validate-commit-msg.sh abgelehnt: 'unknown scope skills — wurde zu agents konsolidiert (T002328)'. Recommit mit scope 'agents' war nötig. Keine Blockade, aber Reibung: wer Skill-Dateien ändert, rät intuitiv 'skills' als Scope.

---

### Mishap 2: agent-lock.sh release schlägt fehl bei Session-ID-Mismatch trotz vorab gesetztem Lock
**Typ:** process | **Komponente:** scripts/agent-lock.sh

Bei T002253 war der Branch-/Ticket-Lock laut Auftrag bereits vom Orchestrator gesetzt ('der Lock ist bereits gesetzt, du musst nichts claimen'). Beim finalen 'agent-lock.sh release ticket/branch' am Ende des Chores schlug der Release ohne --force fehl: 'lock owned by SID 3839851, current SID 3937377' — die ausführende Sub-Session hatte eine andere SID als die, die den Lock ursprünglich gesetzt hat. --force war nötig. Kein Datenverlust, aber das Delegationsmuster (Orchestrator claimt, Subagent released) kollidiert mit der SID-Prüfung von agent-lock.sh.

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
