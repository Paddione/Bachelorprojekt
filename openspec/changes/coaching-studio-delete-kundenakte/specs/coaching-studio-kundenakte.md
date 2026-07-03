## Purpose

Verwaltung von Kundenakten im coaching-studio-Admin-Prototyp: Kundenliste als
React State (statt statischem Array), Löschen mit Bestätigung, Undo und
Persistenz über `localStorage`.

## ADDED Requirements

### Requirement: Kundenliste als React State mit localStorage-Persistenz
Das System SHALL die Kundenliste als React State (`useState` in `app.jsx`)
verwalten, initialisiert aus `localStorage` (Key `coaching-studio-customers`)
mit Fallback auf das statische `CUSTOMERS`-Array, falls kein
`localStorage`-Eintrag existiert. Jede Änderung an der Kundenliste MUST
synchron nach `localStorage` geschrieben werden.

#### Scenario: Initial load falls back to static array
- **GIVEN** no `coaching-studio-customers` entry exists in `localStorage`
- **WHEN** the coaching-studio app mounts
- **THEN** the customer list state is initialized from the static `CUSTOMERS` array

#### Scenario: Initial load reads persisted state
- **GIVEN** a `coaching-studio-customers` entry exists in `localStorage`
- **WHEN** the coaching-studio app mounts
- **THEN** the customer list state is initialized from the `localStorage` entry instead of the static array

#### Scenario: Deletion persists across reload
- **GIVEN** a customer has been deleted from the list
- **WHEN** the page is reloaded
- **THEN** the deleted customer does not reappear in the customer list

### Requirement: Löschen einer Kundenakte mit Bestätigung
Das System SHALL einen Lösch-Button (Trash-Icon) auf der Dashboard-Kachel und
im Seitenkopf der Kundenakte-Detailansicht anbieten. Ein Klick MUST eine
zweistufige Inline-Bestätigung anzeigen, bevor der Eintrag entfernt wird. Bei
Klienten mit aktiven oder pausierten Sessions MUST ein zusätzlicher Warnhinweis
zur Anzahl betroffener Sessions angezeigt werden.

#### Scenario: Delete button on dashboard requires confirmation
- **GIVEN** the dashboard displays a customer card
- **WHEN** the user clicks the trash icon on the card
- **THEN** an inline confirmation ("Wirklich löschen? Ja/Abbrechen") is shown instead of immediately deleting

#### Scenario: Deleting the card does not trigger card navigation
- **GIVEN** the dashboard displays a customer card whose root element handles click-to-navigate
- **WHEN** the user clicks the trash icon on that card
- **THEN** the navigation to the customer detail view is NOT triggered (click propagation is stopped)

#### Scenario: Confirmed deletion removes the customer
- **GIVEN** the inline delete confirmation is shown for a customer
- **WHEN** the user clicks "Ja"
- **THEN** the customer is removed from the customer list state

#### Scenario: Cancelled deletion keeps the customer
- **GIVEN** the inline delete confirmation is shown for a customer
- **WHEN** the user clicks "Abbrechen"
- **THEN** the customer remains in the customer list unchanged

#### Scenario: Warning shown for customers with running sessions
- **GIVEN** a customer has at least one active or paused session
- **WHEN** the delete confirmation is shown for that customer
- **THEN** the confirmation includes a warning stating how many active and paused sessions will also be deleted

#### Scenario: Delete button available in customer detail view
- **GIVEN** the user is viewing a customer's detail page (Kundenakte)
- **WHEN** the page renders
- **THEN** a delete action is available in the page header

#### Scenario: Deleting from detail view navigates back to dashboard
- **GIVEN** the user confirms deletion from the customer detail view
- **WHEN** the deletion completes
- **THEN** the app navigates to the dashboard screen

### Requirement: Rückgängig-Option nach dem Löschen
Das System SHALL nach einer erfolgreichen Löschung einen Hinweis
("Rückgängig"-Toast) mit einem Zeitfenster von 5 Sekunden anzeigen. Ein Klick
auf "Rückgängig" innerhalb dieses Zeitfensters MUST den gelöschten Kunden
inklusive seiner Sessions wiederherstellen.

#### Scenario: Undo toast appears after deletion
- **GIVEN** a customer has just been deleted
- **WHEN** the deletion completes
- **THEN** a toast appears offering to undo the deletion, visible for 5 seconds

#### Scenario: Undo restores the deleted customer
- **GIVEN** the undo toast is visible after a deletion
- **WHEN** the user clicks "Rückgängig" within the 5-second window
- **THEN** the deleted customer (including its sessions) is restored to the customer list

#### Scenario: Undo window expires
- **GIVEN** the undo toast is visible after a deletion
- **WHEN** 5 seconds pass without the user clicking "Rückgängig"
- **THEN** the toast disappears and the deletion remains final

### Requirement: Sicherer Umgang mit leerer Kundenliste
Das System SHALL an allen Stellen, die zuvor auf `CUSTOMERS[0]` als
Fallback-Kunde zugegriffen haben, einen definierten Empty-State rendern statt
abzustürzen, wenn die Kundenliste leer ist.

#### Scenario: Dashboard shows empty state with no customers
- **GIVEN** the customer list is empty
- **WHEN** the dashboard renders
- **THEN** it shows an empty-state message instead of crashing

#### Scenario: Workspace view does not crash with no customers
- **GIVEN** the customer list is empty
- **WHEN** a view that previously fell back to `CUSTOMERS[0]` (e.g. Workspace, Kundenakte, ProfileEditor, CompareView) is rendered without an explicit customer
- **THEN** it shows an empty-state message instead of throwing a runtime error
