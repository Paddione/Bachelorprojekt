## MODIFIED Requirements

### Requirement: Post-Merge Ticket-Lifecycle und Manifest-Deploy

The system SHALL, after every push to `main`, transition the associated ticket to
`awaiting_deploy`, deploy changed Kubernetes manifests to both fleet brands, then
transition the ticket to `done` and run the scout-drift ratchet. The `post-merge`
workflow SHALL serialize concurrent runs via a GitHub Actions `concurrency` group
(static group key on `main`, `cancel-in-progress: false`) so that no two runs execute
`task workspace:deploy` against the fleet cluster at the same time. Both ticket
status-update calls (`scripts/ticket.sh update-status`) SHALL be wrapped in a retry with
exponential backoff (up to 5 attempts) and SHALL remain non-fatal (a permanently failing
status update never blocks the deploy).

#### Scenario: Ticket wird nach Merge auf awaiting_deploy gesetzt

- **GIVEN** der Merge-Commit enthält `T000123` im Commit-Body
- **WHEN** der `post-merge`-Workflow `mark-awaiting` ausführt
- **THEN** ruft er `scripts/ticket.sh update-status --status awaiting_deploy` über die `retry`-Funktion auf; Fehler sind non-fatal

#### Scenario: Manifest-Deploy läuft nur bei manifest-relevanten Änderungen

- **GIVEN** ein Push auf `main` ändert nur `website/src/`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` läuft
- **THEN** setzt der Schritt `manifests_changed=false` — `task workspace:deploy` wird nicht ausgeführt

#### Scenario: Ticket wird nach erfolgreichem Deploy auf done gesetzt

- **GIVEN** beide Deploy-Jobs (`ENV=mentolder` und `ENV=korczewski`) laufen erfolgreich durch
- **WHEN** der `Mark ticket done`-Schritt ausgeführt wird
- **THEN** ruft er `scripts/ticket.sh update-status --status done` über die `retry`-Funktion auf und startet anschließend `scripts/factory/scout-drift.sh` für den Drift-Ratchet

#### Scenario: Konkurrierende Post-Merge-Runs werden serialisiert

- **GIVEN** zwei Merges erreichen `main` innerhalb weniger Sekunden und triggern je einen `post-merge`-Run
- **WHEN** beide Runs durch die `concurrency`-Group mit `cancel-in-progress: false` laufen
- **THEN** läuft genau ein Run zur Zeit; der zweite wartet in der Queue, bis der erste (inkl. `task workspace:deploy` für beide Brands) vollständig fertig ist — keine konkurrierenden `kubectl apply --server-side` am selben Namespace

#### Scenario: Laufender Deploy wird nicht abgebrochen

- **GIVEN** ein `post-merge`-Run führt gerade `task workspace:deploy` aus, während ein neuer Merge eintrifft
- **WHEN** die `concurrency`-Group mit `cancel-in-progress: false` greift
- **THEN** wird der laufende Deploy NICHT abgebrochen, sondern läuft zu Ende; der neue Run wird als pending eingereiht

#### Scenario: Transientes Status-Update wird wiederholt

- **GIVEN** der erste `scripts/ticket.sh update-status`-Aufruf schlägt durch einen transienten kube-apiserver-Timeout fehl
- **WHEN** die `retry`-Funktion mit Exponential-Backoff (2/4/8/16 s, max 5 Versuche) erneut versucht
- **THEN** wird der Status-Übergang bei einem erfolgreichen Folgeversuch gesetzt; bei Erschöpfung gibt `retry` 0 zurück (non-fatal) und der Deploy bleibt grün
