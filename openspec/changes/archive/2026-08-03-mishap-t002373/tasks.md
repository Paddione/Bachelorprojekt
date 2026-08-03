---
title: "mishap-t002373 — Implementation Plan"
ticket_id: T002373
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002373 — Implementation Plan

_Ticket: T002373_

Mishap-Bundle: git-workflow, scripts/agent-lock.sh (2 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: git pull --ff-only scheitert bei unstaged changes trotz reinem Fast-Forward (pull.rebase=true global)
**Typ:** drift | **Komponente:** git-workflow

In .worktrees/agent-lock-claim-strict-args: `git pull --ff-only origin main` brach mit "cannot pull with rebase: You have unstaged changes." ab, obwohl der Branch nur hinter main lag (reiner Fast-Forward, keine Divergenz). Ursache: globales `pull.rebase=true` zwingt pull auf den Rebase-Pfad, der unstaged changes verbietet — auch wenn --ff-only explizit gesetzt ist. Workaround: git stash -u && git merge --ff-only origin/main && git stash pop. Betrifft jeden dev-flow-chore/-execute-Lauf mit uncommitted work in einem veralteten Worktree.

---

### Mishap 2: agent-lock branch-Claim einer abgestürzten Session blockiert Release ohne --force
**Typ:** suspicious | **Komponente:** scripts/agent-lock.sh

Beim Fertigstellen von T002363 (uncommittete Arbeit einer abgestürzten Session) verweigerte `agent-lock.sh release branch <name>` den Release mit "lock owned by SID 2847535, current SID 3899686 — use --force", da die ursprüngliche Session gecrasht war und nie release aufgerufen hatte. Verhalten ist korrekt (Schutz vor Fremd-Release), aber es gibt aktuell keine automatische Erkennung "Owner-SID ist tot" vor dem manuellen --force — reap lief zuvor bereits, hat den Claim aber nicht als stale erkannt.

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
