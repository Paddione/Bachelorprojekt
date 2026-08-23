## ADDED Requirements

### Requirement: Merged-PR-Gate schließt gemergte Tickets vor dem Dispatch

Das Merged-PR-Gate in `scripts/factory/schedule.sh` SHALL unabhängig von der
verfügbaren Slot-Kapazität ausgeführt werden. Ein Kandidat, dessen PR bereits auf
`origin/main` gemergt ist (`check-merged` rc=1), SHALL zu `done` mit passender
Resolution geschlossen werden — auch wenn das Global-Cap bereits ausgeschöpft ist.
Der Cap-Break gilt nur für den Dispatch-Pfad (Claim/Slot-Belegung).

#### Scenario: Kapazitätsdruck verhindert das Schließen nicht mehr

- **GIVEN** der Slot-Pool beider Brands ist so belegt, dass
  `global_used >= FACTORY_GLOBAL_CAP`, bevor alle Kandidaten iteriert wurden
- **AND** ein plan_staged-Kandidat trägt einen auf main gemergten PR-Beleg
- **WHEN** `schedule.sh` die Kandidaten-Schleife ausführt
- **THEN** wird der gemergte Kandidat auf `done/fixed` geschlossen und mit einem
  "gemergt"-Kommentar versehen
- **AND** er erscheint nicht im Launch-Plan und belegt keinen Slot

#### Scenario: Fixture bleibt unter paralleler Slot-Belegung deterministisch

- **GIVEN** der merged-dispatch-gate-Test seedet sein Fixture-Ticket mit
  historischem `created_at`
- **WHEN** andere Sessions während des Testlaufs Slots belegen
- **THEN** erreicht das Fixture-Ticket das Merged-Gate trotzdem, weil es nach
  `ORDER BY … created_at ASC` vor jüngeren Kandidaten sortiert

#### Scenario: Skip-Guard bleibt Skip

- **GIVEN** der Slot-Pool ist beim Teststart zu stark belegt (`_skip_if_pool_busy`)
- **WHEN** der Test läuft
- **THEN** skippt er sichtbar (TAP `# skip`) statt echte Tickets im Live-Dev-DB-Modus
  zu gefährden — ein Skip wird dadurch aber nicht als inhaltlicher Erfolg gezählt;
  die Flakiness-Ursache ist durch die beiden Szenarien oben beseitigt
