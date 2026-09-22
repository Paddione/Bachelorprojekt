## ADDED Requirements

### Requirement: Drag & Drop zwischen Kanban-Buckets im Applications Board

Das Applications Board im Brett SHALL native HTML5 Drag & Drop für Application Cards
unterstützen, sodass Operator:innen Bewerbungen per Drag & Drop zwischen den Kanban-Buckets
(found, drafting, applied, interviewing, offered) verschieben können.

#### Scenario: Card wird draggable

- **GIVEN** das Applications Board ist im Brett-HTML-Container gerendert
- **WHEN** eine Application Card erzeugt wird
- **THEN** erhält das Card-Element das Attribut `draggable="true"`
- **AND** beim Drag-Start wird die Card visuell hervorgehoben (z. B. `opacity: 0.6`)

#### Scenario: Column akzeptiert Drop-Ziel

- **GIVEN** eine Card wird gezogen
- **WHEN** der Drag über eine Column bewegt wird
- **THEN** wird die Column mit visuellem Highlight markiert (z. B. border-color change,
  Hintergrund-Hinterlegung)
- **AND** der Drag-Indikator ("move application to <column-label>") ist sichtbar

#### Scenario: Status-Update beim Drop

- **GIVEN** eine Card wird über eine andere Column losgelassen
- **WHEN** der Drop aufzieht
- **THEN** wird `PUT /api/applications/:id/status` mit `{ status: "<new-column-status>" }`
  aufgerufen
- **AND** bei einer erfolgreichen Antwort (200) wird das Board neu geladen, um den aktualisierten
  Datenstand zu zeigen
- **AND** bei einem Fehler (4xx/5xx) wird ein Fehlerbanner angezeigt und die Card bleibt
  in ihrer ursprünglichen Column

#### Scenario: Drag über nicht-droppbare Zonen

- **GIVEN** eine Card wird gezogen
- **WHEN** der Drag über Bereiche außerhalb einer Column bewegt wird
- **THEN** wird kein Drop-Ziel-Highlight angezeigt
- **AND** beim Loslassen außerhalb einer Column wird kein API-Call ausgeführt
