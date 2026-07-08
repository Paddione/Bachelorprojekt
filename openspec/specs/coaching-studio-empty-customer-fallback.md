# coaching-studio-empty-customer-fallback

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu coaching-studio-empty-customer-fallback ergänzen._

## Requirements

### Requirement: coaching-studio Workspace bleibt bei leerem CUSTOMERS-Array stabil

Das statische coaching-studio-Prototyp (`website/public/coaching-studio/`) SHALL nicht
abstürzen, wenn `CUSTOMERS` (in `data.jsx`) leer ist. Screens, die
`customer || CUSTOMERS[0]` als Fallback nutzen, SHALL zusätzlich auf ein
`EMPTY_CUSTOMER`-Platzhalterobjekt zurückfallen (`customer || CUSTOMERS[0] || EMPTY_CUSTOMER`),
sodass `Workspace()`, `Kundenakte()`, `ProfileEditor()` und `CompareView()` immer ein
definiertes Objekt mit allen von diesen Screens gelesenen Feldern erhalten
(`name`, `initials`, `since`, `lang`, `category`, `aktiv`, `pausiert`, `fertig`, `sessions`).

#### Scenario: Klick auf "Neue Session" bei leerer Kundenliste crasht nicht

- **GIVEN** `CUSTOMERS` ist ein leeres Array (Standardzustand seit T001560)
- **WHEN** im coaching-studio-Prototyp auf "Neue Session" (Dashboard oder TopBar) geklickt wird
- **THEN** wird kein uncaught `pageerror` ausgelöst und die Workspace-Ansicht rendert
  (`.ws`-Container / "Ebene 01"-Überschrift)

<!-- merged from change delta coaching-studio-empty-customer-fallback.md (0eced760f180) -->