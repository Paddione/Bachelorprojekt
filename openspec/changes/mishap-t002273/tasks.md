---
title: "mishap-t002273 — Implementation Plan"
ticket_id: T002273
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002273 — Implementation Plan

_Ticket: T002273_

Mishap-Bundle: Taskfile/freshness (1 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: freshness:check braucht bei neuen Dateien reproduzierbar zwei Runden (repo-index stale)
**Typ:** degraded | **Komponente:** Taskfile/freshness

`task freshness:check` schlug in BEIDEN Changes dieses Zyklus beim ersten Lauf fehl:

  ✗ docs/code-quality/repo-index.json is stale — run 'task freshness:regenerate' locally and commit

URSACHE: `quality:index` (emit-index.mjs) baut seine Datei-Universe aus `git ls-files` — also nur aus GETRACKTEN Dateien. Eine frisch angelegte Skriptdatei ist beim ersten `freshness:regenerate` noch untracked und wird nicht mitgezaehlt; erst nach `git add` erscheint sie, was den Index erneut aendert. Es braucht also reproduzierbar zwei Runden:

  freshness:regenerate -> git add <neue Datei> -> quality:index -> git add repo-index.json -> freshness:check

BEOBACHTET: bei scripts/filter-generated.sh (T002255, file_count 548 -> 549) und bei scripts/ticket-reclaim.sh (T002267). In beiden Faellen identisches Muster, in beiden Faellen kostete es einen zusaetzlichen Durchlauf des ~9s-Gates plus einen Commit-Amend.

KEIN Fehler im engeren Sinn — das Verhalten folgt zwingend aus der git-ls-files-Basis und ist sogar korrekt. Aber es ist ein wiederkehrender Stolperstein, der Agenten zuverlaesslich einmal auf die Nase fallen laesst.

MASSNAHME: Hinweis in .claude/skills/references/verification-block.md aufnehmen — "Bei NEUEN Dateien: erst `git add`, dann `task quality:index` erneut laufen lassen, dann `freshness:check`." Alternativ koennte `quality:index` untracked-aber-nicht-ignorierte Dateien mitzaehlen (`git ls-files --others --exclude-standard`), dann entfiele die zweite Runde ganz; das aendert allerdings die Semantik der Scan-Universe und braucht eine eigene Bewertung.

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
