---
title: "mishap-rollup-carryover — Implementation Plan"
ticket_id: T013108
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-carryover — Implementation Plan

Unerledigte Mishap-Einträge sollen den Container-Close überleben, und der SSOT-Spec soll den
Lebenszyklus beschreiben, den der Code tatsächlich fährt. Hintergrund und Belege im `proposal.md`.

## File Structure

```
scripts/factory/rollup-carryover.sh                        (NEU — Übertrag, zwei Modi: --plan und --scan)
scripts/factory/mishap-rollup.sh                           (ruft den Übertrag vor dem Lesen der Kommentare)
tests/spec/mishap-rollup/rollup-carryover.bats             (RED-Test, liegt bereits vor)
openspec/specs/mishap-rollup.md                            (Purpose ergänzt — der Platzhalter forderte es)
openspec/changes/mishap-rollup-carryover/specs/mishap-rollup.md  (MODIFIED Lebenszyklus + ADDED Carry-over)
.claude/skills/mishap-tracker/SKILL.md                     (Carry-over in der Garantie-Liste)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/mishap-rollup/rollup-carryover.bats` ist mit diesem
      Plan committet und rot — `scripts/factory/rollup-carryover.sh` existiert noch nicht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-carryover.bats
# expected: FAIL (rot — scripts/factory/rollup-carryover.sh fehlt noch)
```

- [x] **Übertrag anlegen (GREEN, Teil 1).** `scripts/factory/rollup-carryover.sh` mit zwei Modi:
      - `--plan <tasks.md> --slug <quell-slug>` gibt einen Batch-Body aus, der nur die offenen
        Eintrags-Tasks (`- [ ] **N. …`) trägt. Format wie der Flusher es schreibt
        (`### Mishap-Rollup`-Header, Tabelle, `**N. Titel** (typ, komponente)`-Blöcke), sonst
        erkennt `rollup-plan-tasks.sh` den Übertrag nicht als Batch. Exit 3, wenn nichts offen ist.
      - `--scan <repo> --container <id>` listet `<slug>\t<plan>` der übertragbaren Zyklen.
        Ausgeschlossen: der Zyklus des aktuellen Containers, vollständig disponierte Zyklen, und
        alle bis auf den jüngsten Kandidaten (Datum aus dem Slug, nicht aus dem Pfad — archivierte
        Changes tragen ein zusätzliches Datumspräfix).

- [x] **Generator anschließen (GREEN, Teil 2).** In `scripts/factory/mishap-rollup.sh` den
      Übertrag **vor** dem Lesen der Kommentare aufrufen, damit übernommene Einträge im selben Lauf
      mitgezählt und geplant werden. Idempotenz über `body LIKE '%Carry-over aus <slug>%'` am
      Container. Ein Fehlschlag darf den Rollup nicht abbrechen — der Quell-Plan bleibt liegen und
      der nächste Lauf holt es nach.

- [x] **SSOT-Spec korrigieren.** Delta unter
      `openspec/changes/mishap-rollup-carryover/specs/mishap-rollup.md`: `MODIFIED` auf
      *Rollup container SHALL be ephemeral* — Generator staged, Factory dispatcht, Finalizer
      schließt mit `resolution=fixed`; das Szenario *Generator closes the container* wird durch
      *Generator stages the plan* und *Closure follows the merge* ersetzt. Dazu `ADDED` für den
      Carry-over. Der Requirement-Titel im `MODIFIED`-Block muss dem bestehenden **wörtlich**
      entsprechen, sonst ersetzt das Archivieren ihn nicht, sondern schreibt daneben.

- [x] **Purpose ergänzen.** `openspec/specs/mishap-rollup.md` trägt den Platzhalter
      „Purpose fehlt — beim nächsten inhaltlichen Delta ergänzen". Dieser Change ist ein solches
      Delta, also einlösen.

- [x] **Skill-Doku nachziehen.** `.claude/skills/mishap-tracker/SKILL.md`: den Carry-over in die
      Garantie-Liste des Generators aufnehmen und sagen, was er für einen offenen Eintrag bedeutet.

- [x] **Probe gegen das echte Repo.** Der Scan darf auf dem Bestand nichts finden — Zyklen vor
      T013043 haben keine Eintrags-Checkboxen:

```bash
bash scripts/factory/rollup-carryover.sh --scan "$PWD" --container T012973
# erwartet: Exit 3 (keine Rückwirkung auf Bestandspläne)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
