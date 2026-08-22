## ADDED Requirements

### Requirement: PVC-Clone-Lifecycle-Hygiene

Der pvc-backup Orchestrator SHALL sicherstellen, dass Backup-Clone-PVCs und Mounter-Jobs nach jedem Lauf vollständig aus dem Namespace entfernt sind, und SHALL einen Lauf abbrechen, wenn ein Clone nicht löschbar ist — mit einer Fehlermeldung, die die blockierenden Pods benennt.

#### Scenario: Stuck Terminating clone fails fast with actionable message

- **GIVEN** die Clone-PVC `vaultwarden-data-backup-clone` hängt auf `Terminating` (z. B. weil ein alter Pod den `pvc-protection`-Finalizer hält)
- **WHEN** der Orchestrator versucht, den stale Clone zu löschen
- **THEN** bricht der Lauf innerhalb von 120 Sekunden mit Exit-Code ungleich 0 ab
- **AND** das Log listet jeden Pod, der die PVC noch referenziert (Name, Phase, Node)

#### Scenario: Clone being deleted is not treated as bound

- **GIVEN** eine Clone-PVC mit gesetztem `metadata.deletionTimestamp` und `status.phase=Bound`
- **WHEN** der Orchestrator auf das Binden des Clones wartet
- **THEN** bricht der Lauf sofort mit einer expliziten Fehlermeldung ab, statt den löschenden Clone als gebunden zu akzeptieren

#### Scenario: Finished mounter jobs cannot become zombies

- **GIVEN** ein beendeter (Complete oder Failed) pvc-backup Mounter-Job aus einem vorherigen oder manuellen Lauf
- **WHEN** der nächste Orchestrator-Lauf startet
- **THEN** existiert nach dem Lauf kein Mounter-Job/Pod mehr im Namespace
- **AND** der Mounter-Job trägt `ttlSecondsAfterFinished`, sodass auch manuelle Läufe ohne aufräumenden Trap keine bleibenden Artefakte hinterlassen
