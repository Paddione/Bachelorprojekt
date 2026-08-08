---
title: "epic-lastenheft-gate — Implementation Plan"
ticket_id: T002617
domains: [website, factory, tickets]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# epic-lastenheft-gate — Implementation Plan

_Ticket: T002617_

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `website/src/lib/planning-office.ts` | geändert | Listung, Anlage und Patch für `type='project'` |
| `website/src/lib/planning-office.test.ts` | geändert | Vitest für Listung, Anlage, Lock-Pfad |
| `website/src/components/PlanningOffice.svelte` | geändert | Epics sichtbar von Features unterscheiden |
| `tests/spec/planning-office/epic-lastenheft.bats` | neu | Guard für den CLI-Lock-Pfad auf `type=project` |

**Zeilenbudgets.** Alle vier Dateien liegen deutlich unter ihren Extension-Limits aus
`docs/code-quality/gates.yaml`, und keine ist in `docs/code-quality/baseline.json` eingetragen; die
wirksame Schwelle ist damit jeweils das statische Limit. Die Änderungen sind additiv und klein
(Typfilter erweitern, ein Feld durchreichen, Testfälle ergänzen) — ein Split ist an keiner Stelle
nötig. `scripts/ticket.sh` wird bewusst nicht angefasst.

**Partial-Manifest** — disjunkte `target_files`, Tests zuletzt:

| Partial | Rolle | target_files |
|---|---|---|
| p1 | Datenschicht | `website/src/lib/planning-office.ts` |
| p2 | Oberfläche | `website/src/components/PlanningOffice.svelte` |
| p3 | Tests | `website/src/lib/planning-office.test.ts`, `tests/spec/planning-office/epic-lastenheft.bats` |

---

## Task 1 (p1) — Planungsbüro erfasst `type='project'`

Drei Stellen in `website/src/lib/planning-office.ts`:

**Listung.** Der Typfilter der Planungsliste wird um `project` erweitert. Der Statusfilter
`status = 'planning'` bleibt unverändert — er ist genau die Bedingung, die „editierbar" definiert.
Die Projektion gibt zusätzlich den Tickettyp zurück, damit die Oberfläche Epics erkennen kann; das
Interface der Zeile wird entsprechend ergänzt.

**Anlage.** Die Anlage bekommt einen Weg, ein Epic zu erzeugen: Typ `project`, Status `planning`.
Bestehende Aufrufer ohne Typangabe erzeugen weiterhin `feat` — das Verhalten für Features ändert
sich nicht.

**Patch.** Der Patch-Pfad prüft beim Nachladen der Requirements zusätzlich auf
`status = 'planning'`. Dieser Guard bleibt **unverändert**: Er ist der Grund, warum ein gesperrtes
Lastenheft nicht mehr editierbar ist, und genau das ist die getroffene Designentscheidung. Zu
prüfen und gegebenenfalls anzupassen ist allein, ob der Pfad implizit an den Typ gebunden ist.

Der Lock-Pfad selbst wird nicht angefasst. Er ruft `canLock` und `normalizeRequirements` aus
`website/src/lib/tickets/lastenheft.ts` und ist typunabhängig.

## Task 2 (p2) — Epics in der Oberfläche unterscheiden

`website/src/components/PlanningOffice.svelte` zeigt Epics erkennbar anders als Features — ein Epic
trägt Kinder und wird anders gelesen als ein einzelnes Feature. Es genügt eine schlichte, eindeutige
Auszeichnung anhand des in Task 1 durchgereichten Typs; kein neues Layout.

Keine Marken-Domainliterale, und keine neuen `any`-Typen — das Gate CQ02 zählt global über
`website/src`.

## Task 3 (p3) — Tests

Prüfmodus: **Output-Verifikation**. Die Tests prüfen Rückgabewerte und gespeicherte Zustände, nicht
Implementierungsmuster im Quelltext.

**Failing-Test-Step (rot vor grün)** — vor der Implementierung von Task 1 ausführen:

```bash
cd website && npx vitest run src/lib/planning-office.test.ts
# expected: FAIL — der Typfilter kennt 'project' noch nicht, ein angelegtes Epic
# erscheint nicht in der Planungsliste.
```

Danach dieselbe Zeile erneut, bis sie grün ist.

**Vitest** (`website/src/lib/planning-office.test.ts` erweitern, keine neue Datei):

- Ein `type='project'`-Ticket in `planning` erscheint in der Planungsliste.
- Ein `type='feat'`-Ticket erscheint weiterhin — Positiv-Anker gegen einen Filter, der versehentlich
  nur noch Epics listet.
- Ein über die Anlage erzeugtes Epic hat Typ `project` und Status `planning`.
- Requirements lassen sich auf ein Epic patchen und kommen unverändert zurück.
- Lock mit mindestens einem Requirement setzt das Lock-Flag; Lock ohne Requirement schlägt fehl und
  lässt das Flag ungesetzt.
- Ein gesperrtes Epic nimmt keine Requirements-Änderung mehr an.

**BATS** (`tests/spec/planning-office/epic-lastenheft.bats`, eigenes Verzeichnis nach T002416):

- `ticket.sh lastenheft lock` auf ein `type=project`-Ticket **mit** mindestens einem Requirement
  endet mit Exit null — Positiv-Anker **vor** der Negativ-Aussage.
- Derselbe Aufruf **ohne** Requirement endet mit Exit ungleich null und nennt das leere Lastenheft.

Nach dem Anlegen der Testdateien `task test:inventory` ausführen und
`website/src/data/test-inventory.json` mitcommitten.

## Task 4 — Bestandsdatum T002440

T002440 ist das einzige offene Epic und steht auf `backlog`. Damit sein Lastenheft erfasst werden
kann, wird es einmalig in den editierbaren Zustand zurückgeholt:

```bash
bash scripts/ticket.sh update-status --id T002440 --status planning
```

Die acht abgeschlossenen Epics bleiben unangetastet — rückwirkende Befüllung ist ausdrücklich nicht
Teil dieses Vorgangs. Dieser Schritt ist eine Datenkorrektur, keine Codeänderung, und gehört deshalb
in keinen Partial.

## Task 5 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
cd website && npx vitest run src/lib/planning-office.test.ts
tests/unit/lib/bats-core/bin/bats -r tests/spec/planning-office/
bash scripts/plan-lint.sh openspec/changes/epic-lastenheft-gate/tasks.md
```

Abnahmeprobe am echten Datensatz: T002440 im Planungsbüro öffnen, ein Requirement erfassen, sperren,
und prüfen, dass der Status danach `backlog` ist und das Lastenheft nicht mehr editierbar erscheint.
