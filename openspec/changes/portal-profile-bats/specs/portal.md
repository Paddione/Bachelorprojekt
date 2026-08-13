## ADDED Requirements

### Requirement: Profil-Validierung ist ohne DB- und Vite-Abhängigkeiten testbar

The system SHALL keep the profile input validation logic (`ProfileInput`, `MAXLEN`,
`validateProfileInput`, `CONTACT_CHANNELS`, `COMM_FREQUENCIES`, `CUSTOMER_STATUSES`,
`CONTACT_TYPES`) in a module that imports nothing from the DB or Vite/Astro layers, so the
validation can be exercised under plain tsx/node in the offline BATS gate. `customer-crm-db.ts`
SHALL re-export these symbols unchanged, so existing importers (API routes, Astro components,
Vitest tests) keep working without modification.

#### Scenario: Validierungsmodul lädt unter plain tsx/node ohne TypeError

- **GIVEN** `website/src/lib/profile-validation.ts` existiert und importiert kein anderes Modul
- **WHEN** `validateProfileInput` per `npx tsx -e` aus diesem Modul importiert wird
- **THEN** der Import läuft ohne `TypeError` (keine Vite-only `import.meta.glob`-API im
  Modul-Graph)
- **AND** `validateProfileInput` liefert dieselben Ergebnisse wie spezifiziert (Feldlängen,
  Kontaktkanal-Enum, Kommunikationsfrequenz-Enum)

#### Scenario: Re-Export hält die bestehende Import-API stabil

- **GIVEN** `customer-crm-db.ts` importiert die Validierungssymbole aus `profile-validation.ts`
- **WHEN** `validateProfileInput`, `CONTACT_TYPES` oder `CONTACT_CHANNELS` weiterhin aus
  `customer-crm-db.ts` importiert werden
- **THEN** sind die Werte und das Verhalten identisch zum direkten Import aus
  `profile-validation.ts`

#### Scenario: BATS-Guard läuft wieder im Offline-Gate

- **GIVEN** `tests/unit/portal-profile-update.bats` ist nicht mehr in
  `tests/unit/.coverage-allowlist` gelistet
- **WHEN** `task test:unit` (Offline-Gate) ausgeführt wird
- **THEN** laufen alle 4 Tests der Datei grün, ohne Datenbank oder Cluster
