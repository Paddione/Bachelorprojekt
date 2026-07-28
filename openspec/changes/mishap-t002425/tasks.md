---
title: "mishap-t002425 — Implementation Plan"
ticket_id: T002425
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002425 — Implementation Plan

_Ticket: T002425_

Mishap-Bundle: dev-flow, tooling (5 Einträge aus T002413/T002416/T002418)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: agent-lock.sh claim — Skill dokumentiert veraltete Positional-Syntax
**Typ:** process | **Komponente:** dev-flow

dev-flow-plan/SKILL.md und session-coordination.md zeigen `bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" claude dev-flow-plan` (positional). Das Skript verlangt benannte Flags und antwortet mit `AGENT-LOCK: claim: unbekanntes Argument 'claude'` / `Erwartet werden benannte Flags: --label <l> --worktree <p> --branch <b> --ticket <id>`. Auswirkung: der Claim schlaegt still fehl (Exit != 0, aber im Skill-Ablauf ohne Pruefung), und der Pre-Commit-Guard in Schritt 5 findet spaeter keine Lock-Datei. Korrekte Form: `claim ticket <id> --label <l> --worktree <p> --branch <b> --ticket <id>`.

---

### Mishap 2: Commit-Scope 'specs' existiert nicht, aber der Brainstorming-Skill schreibt dorthin
**Typ:** process | **Komponente:** dev-flow

superpowers:brainstorming legt die Design-Spec nach `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` und verlangt einen Commit. Der naheliegende Scope `docs(specs):` wird von validate-commit-msg abgelehnt: `unknown scope 'specs' — 'specs' wurde zu 'plans' konsolidiert (T002328)`. Auswirkung: jeder Brainstorming-Abschluss laeuft in einen fehlgeschlagenen Commit, bis man `scopes` abfragt. Der korrekte Scope ist `plans`. Entweder der Skill nennt ihn, oder 'specs' wird als Alias auf 'plans' zugelassen.

---

### Mishap 3: preflight-pr-scope.sh scheitert ohne Argument mit unklarer Meldung
**Typ:** suspicious | **Komponente:** scripts

`bash scripts/preflight-pr-scope.sh` (wie in git-workflow beschrieben, ohne Argument) liefert `scripts/preflight-pr-scope.sh: line 19: 1: Usage: preflight-pr-scope.sh <PR title>` — eine Bash-Fehlermeldung, in der die Usage-Zeile als Fehlertext eines fehlenden Parameters erscheint. Es ist nicht erkennbar, dass schlicht der PR-Titel fehlt. Ein sauberes `[ $# -ge 1 ] || { echo "Usage: ..." >&2; exit 2; }` wuerde reichen.

---

### Mishap 4: baseline.json bekommt beim Regenerieren einen Wiedergaenger-Key
**Typ:** suspicious | **Komponente:** scripts

Auf fix/conflict-gate-T002418 fuegte `task freshness:regenerate` den Key `S1:website/src/components/FactoryFloor.svelte` mit `metric: 521, frozen_at: 2bd6aab76` in docs/code-quality/baseline.json ein. Die Datei hat real 329 Zeilen und ist byte-identisch zu origin/main; auf main fehlt der Key. Die Baseline-Key-Count-Assertion in freshness:check schlug daraufhin fehl und verlangte ein `[baseline-allow:<reason>]` im PR-Body — fuer eine Datei, die der PR gar nicht anfasst. `git checkout origin/main -- docs/code-quality/baseline.json` loeste es, und der Key kam beim naechsten Lauf NICHT wieder. Auswirkung: ein PR wird wegen einer fremden, veralteten Zeile blockiert; die geforderte Aktion (baseline-allow-Tag) waere die falsche Antwort gewesen.

---

### Mishap 5: CI wird fuer einen frisch gepushten SHA nicht getriggert
**Typ:** process | **Komponente:** dev-flow

Nach `git push` auf fix/conflict-gate-T002418 meldete `gh pr checks` ueber mehrere Minuten `no checks reported on the branch`; `gh api repos/.../commits/<sha>/check-runs` lieferte `total_count: 0`, waehrend die letzten Runs noch am vorherigen SHA hingen. `gh workflow run ci.yml` ist kein Ausweg — ci.yml hat keinen workflow_dispatch-Trigger (HTTP 422). Ein leerer Commit hat CI wieder angestossen. Auswirkung: ohne diesen Kniff sieht ein PR dauerhaft "gruen ohne Checks" aus und Auto-Merge greift nie. Deckt sich mit dem bekannten devflow-ci-watch-False-Positive; hier zusaetzlich belegt, dass workflow_dispatch als Rettungsanker fuer ci.yml nicht zur Verfuegung steht.

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
