# Proposal: epic-lastenheft-gate

## Why

Jedes Epic soll ein Lastenheft bekommen: Nutzer erfassen die Anforderungen, editieren sie, und
sperren sie schließlich — erst der Lock gibt das Epic zur Weiterverarbeitung in der Factory frei.

Heute ist das nicht möglich. Gemessen am 2026-08-03 über alle neun `type=project`-Tickets:

```
T002440  status=backlog  requirements=0  lastenheft_locked=unset
T002458  status=done     requirements=0  lastenheft_locked=unset
… (sieben weitere, identisch)
```

**Kein einziges Epic hat ein Lastenheft** — und zwar nicht aus Nachlässigkeit, sondern weil es
keinen Weg gibt, eines zu erfassen. `website/src/lib/planning-office.ts` listet in
`listPlanningItems`:

```sql
WHERE type IN ('feature','feat') AND status = 'planning'
```

Epics sind `type='project'` und damit vom Planungsbüro vollständig ausgeschlossen. `createIdea`
legt zusätzlich hart `'feat'` an.

Der Mechanismus selbst ist vollständig vorhanden und wird **nicht** neu gebaut:
`website/src/lib/tickets/lastenheft.ts` (`canLock`, `normalizeRequirements`,
`isLastenheftLocked`), die Komponenten `PlanningOffice.svelte` und `PlanningOfficeDetail.svelte`,
die API unter `website/src/pages/api/admin/planungsbuero/`, das CLI-Kommando
`ticket.sh lastenheft lock|unlock`, sowie der Factory-Queue-Filter in `scripts/factory/queue.sh`,
der `lastenheft_locked = true` bereits heute als Bedingung führt.

Es fehlt ausschließlich die Abdeckung von `type='project'`.

## What

Epics durchlaufen denselben Fluss wie Features: **Idee → Pflichtenheft (editierbar) → Lock →
`backlog` (eingefroren, factory-freigegeben)**.

- Das Planungsbüro listet und patcht `type='project'` neben `feat` und `feature`.
- Epics werden mit `status='planning'` angelegt, damit sie im editierbaren Zustand starten.
- Die Oberfläche unterscheidet Epics sichtbar von Features — sie tragen Kinder und werden anders
  gelesen.
- Das einzige offene Epic (T002440) wird einmalig nach `planning` zurückgeholt, damit sein
  Lastenheft überhaupt erfasst werden kann.

**Designentscheidung (Nutzer, 2026-08-03): Variante (a).** Epics starten in `planning`, statt den
Patch-Guard für `type='project'` auf weitere Status auszuweiten. Damit bleibt der Guard unverändert
und die Lock-Semantik eindeutig: *gesperrt heißt eingefroren*. Variante (b) hätte das Lastenheft
auch aus `backlog` heraus editierbar gemacht und genau diese Aussage aufgeweicht.

Ausdrücklich bestätigt und deshalb **nicht** geändert: `lastenheft lock` schiebt den Status nach
`backlog`. Das ist der beabsichtigte Ruhezustand eines gesperrten Lastenhefts, kein Defekt.

## Abgrenzung

- **Keine** Neuimplementierung des Lock-Mechanismus — er existiert und funktioniert.
- **Keine** Änderung der Lock-Semantik oder des Status-Übergangs beim Sperren.
- **Keine** rückwirkende Befüllung der acht abgeschlossenen Epics.
- **Keine** Änderung an `scripts/ticket.sh` — die Epic-Anlage gehört ins Planungsbüro.

_Ticket: T002617_
