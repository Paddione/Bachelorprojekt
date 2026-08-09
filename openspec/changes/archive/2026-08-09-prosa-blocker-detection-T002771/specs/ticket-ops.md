# Delta: ticket-ops

## ADDED Requirements

### Requirement: Prosa-Blocker-Erkennung in Phase 1
Die Completeness Triage MUSS Ticket-Beschreibungen auf Schlüsselwörter wie
"BLOCKIERT VON", "hängt an" scannen und gefundene Referenzen in `depends_on`
überführen. Bereits gemergte PRs werden als aufgelöster Blocker erkannt.

#### Scenario: Prosa-Blocker wird in depends_on überführt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234"
- **WHEN** die Completeness Triage läuft
- **THEN** die PR-Referenz wird in `depends_on` überführt

#### Scenario: Bereits gemergter PR wird als aufgelöst erkannt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234" und PR #1234 ist gemergt
- **WHEN** die Completeness Triage läuft
- **THEN** der Blocker wird als aufgelöst markiert und das DoR-Flag `abhaengigkeiten_klar` auf true gesetzt
