---
title: "plan-context-summary — Implementation Plan"
ticket_id: T002322
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-context-summary — Implementation Plan

_Ticket: T002322_

`plan-context.sh` gibt pro eingeschlossenem Proposal ~320 Zeilen aus, weil es vier Dateien
vollständig `cat`t. Bei 46 Proposals für `bachelorprojekt-infra` ergibt das 14 711 Zeilen —
Kontext, der laut CLAUDE.md vor jeden Agent-Dispatch gehört und deshalb in der Praxis
übersprungen wird. Vollständige Messreihe und die Korrektur der ursprünglichen
Ticket-Diagnose stehen in `proposal.md`.

## File Structure

```
scripts/plan-context.sh          (geändert — Zusammenfassung, --full, fail-closed)
tests/spec/plan-context.bats     (geändert — 2 Tests, bereits im Stage-Commit)
openspec/changes/plan-context-summary/specs/dev-flow-plan.md   (neu — Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die beiden Tests liegen im Stage-Commit dieses Branches
      (`tests/spec/plan-context.bats`, Marker `T002322`). Test 1 verlangt, dass eine
      Fixture mit 200 Detailzeilen im `tasks.md` nur als Zusammenfassung erscheint.

      **Test 2 (`--full`) ist vor dem Fix leer-grün** — das Flag ist noch unbekannt, wird
      ignoriert, und der Volltext kommt ohnehin. Er wird erst nach dem Fix aussagekräftig:
      dann fällt er rot, wenn die Zusammenfassung gebaut, das Flag aber vergessen wurde.
      Nicht auf sein grünes Ergebnis vorher berufen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/plan-context.bats -f "T002322"
# expected: FAIL (rot — Test 1 scheitert, der Volltext leckt durch)
```

- [ ] **Fix-Step A (GREEN) — Zusammenfassung als Standard.** In `scripts/plan-context.sh`
      den Ausgabeblock (aktuell Zeilen 101–126) ersetzen. Statt vier vollständiger `cat`s
      pro Proposal:

      - Slug und Titel wie bisher (`### Active proposal: <slug>`)
      - die Kurzbeschreibung aus `proposal.md` — der erste Absatz nach der H1
      - die Task-Überschriften aus `tasks.md` (Zeilen, die mit `## ` beginnen)
      - eine Zeile, die auf den Volltext verweist (Pfad + Hinweis auf `--full`)

      `tasks.d/`-Partials und `design.md` fallen im Standardmodus weg; im `--full`-Modus
      bleiben sie wie bisher.

- [ ] **Fix-Step B (GREEN) — `--full` einführen.** Ein Flag, das exakt das heutige Verhalten
      wiederherstellt. Es muss vor der Rollen-Auswertung geparst werden, damit es nicht als
      Rollenname missverstanden wird — sonst landet es im Unknown-Role-Zweig und liefert
      still `__ALL__`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/plan-context.bats -f "T002322|PCF"
# expected: PASS (grün — inklusive der 11 PCF-Bestandstests zum Rollenfilter)
```

- [ ] **Fix-Step C — Legacy-Zweig fail-closed.** Zeile 82–85: Ein Proposal ohne auffindbares
      `domains:` wird für rollengefilterte Läufe **ausgeschlossen** statt eingeschlossen. Der
      WARN mit dem Slug bleibt, damit die 16 betroffenen Proposals auffindbar sind.

      `orchestrator` und der Unknown-Role-Fail-soft behalten `__ALL__` — dort ist
      „alles zeigen" die richtige Antwort.

- [ ] **`--with-openspec` prüfen.** Der Flag ändert die Zeilenzahl aktuell überhaupt nicht
      (14711 mit und ohne). Feststellen, ob `openspec-context.sh` nichts liefert oder ob das
      Ergebnis verworfen wird. Ergebnis im Ticket festhalten — auch wenn es sich als harmlos
      erweist, nicht stillschweigend übergehen.

```bash
diff <(bash scripts/plan-context.sh bachelorprojekt-infra 2>/dev/null) \
     <(bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec 2>/dev/null) | head
# expected: ein Unterschied — falls leer, ist der Flag wirkungslos
```

- [ ] **Wirkung messen.** Die Zahlen aus `proposal.md` gegenprüfen:

```bash
for r in bachelorprojekt-infra bachelorprojekt-db bachelorprojekt-test; do
  echo -n "$r: "; bash scripts/plan-context.sh $r 2>/dev/null | wc -l
done
# expected: vierstellig oder kleiner statt 14711 / 4079 / 14436
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
