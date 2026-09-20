## ADDED Requirements

### Requirement: Merge-Ticket-Abgleich als verbindlicher repo-hygiene-Schritt

The system SHALL in repo-hygiene-ops.md §3 einen verbindlichen Aufruf von
`scripts/factory/auto-close-merged.sh` fuer beide Brands (mentolder,
korczewski) dokumentieren, unabhaengig davon, ob die Factory-Autopilot-Tick-
Schleife (`scripts/factory/wakeup.sh:248`) gerade laeuft.

#### Scenario: repo-hygiene-Lauf findet einen Nachzuegler unabhaengig von der Factory

- **GIVEN** ein PR wurde gemergt und sein Ticket steht trotz `mergedAt`
  weiterhin offen (die Factory-Wakeup-Schleife lief in diesem Fenster nicht)
- **WHEN** ein repo-hygiene-Lauf §3 gemaess Ablauf ausfuehrt
- **THEN** ruft er `BRAND=<brand> bash scripts/factory/auto-close-merged.sh`
  fuer mentolder UND korczewski auf
- **AND** der Aufruf ist im Ablaufabschnitt selbst als verbindlich markiert,
  nicht nur als Hintergrundinformation ueber `wakeup.sh:248` erwaehnt
