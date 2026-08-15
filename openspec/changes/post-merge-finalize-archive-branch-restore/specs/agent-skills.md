## ADDED Requirements

### Requirement: Finalize-Skript restauriert den Arbeitsbaum-Branch nach der Archiv-Sektion

Das Skript `scripts/devflow-post-merge-finalize.sh` SHALL vor der Archiv-Sektion (Schritt 8) den aktuellen Branch des betroffenen Arbeitsbaums merken (`ARCHIVE_PREV_BRANCH`) und ihn nach der Sektion wiederherstellen. Die Archiv-Sektion wechselt per `git checkout -B "$ARCHIVE_BRANCH" origin/main` den Branch des geteilten Arbeitsbaums (Worktree oder Haupt-Checkout); dieser Wechsel SHALL den Arbeitsbaum nicht dauerhaft auf dem Archiv-Branch zurücklassen. Der Restore SHALL auch dann greifen, wenn die Sektion auf einem Fehlerpfad endet (z. B. `gh pr create`/`gh pr merge` schlägt fehl). Schlägt der Restore fehl, SHALL das Skript mit einer `FATAL`-Meldung und Exit-Code 1 enden statt Erfolg zu melden.

Hintergrund: Nach-Merge-Befund zu T006348 — der Plan (Befund 2) deklarierte den Restore, PR #4572 implementierte nur den ls-remote-Idempotenz-Skip. Ohne Restore bleibt der geteilte Arbeitsbaum auf `chore/plan-archive-<slug>-<ticket>` stehen: T002357-Fallenklasse (parallele Sessions im geteilten Checkout laufen auf dem falschen Branch weiter), dokumentiert in T006367.

#### Scenario: Nach erfolgreicher Archivierung steht der Arbeitsbaum wieder auf dem vorherigen Branch

- **GIVEN** die Archiv-Sektion von `scripts/devflow-post-merge-finalize.sh` hat den Archiv-Branch per `git checkout -B` gewechselt und Push + Archiv-PR abgeschlossen
- **WHEN** die Sektion endet
- **THEN** ist der Arbeitsbaum zurück auf dem vor der Sektion gemerkten Branch (`ARCHIVE_PREV_BRANCH`)
- **AND** die Sektion meldet den Restore in ihrer Erfolgsmeldung

#### Scenario: Fehlerpfad in der Archiv-Sektion hinterlässt keinen gewechselten Arbeitsbaum

- **GIVEN** die Archiv-Sektion ist auf dem Archiv-Branch und schlägt danach fehl (z. B. `gh pr create` liefert keine PR-URL)
- **WHEN** die Sektion mit Fehler endet
- **THEN** wird der Arbeitsbaum trotzdem auf den gemerkten Branch zurückgeschaltet
- **AND** das Skript endet mit Exit-Code 1 (die `FATAL`-Meldung bleibt sichtbar)

#### Scenario: Restore-Fehler ist kein stiller Erfolg

- **GIVEN** der Restore auf `ARCHIVE_PREV_BRANCH` schlägt fehl (z. B. der Branch existiert nicht mehr)
- **WHEN** die Archiv-Sektion endet
- **THEN** meldet das Skript `FATAL` auf stderr
- **AND** das Skript endet mit Exit-Code 1 statt die verbleibenden Schritte als Erfolg abzuhaken

#### Scenario: Archiv-Branch existiert bereits remote — kein Restore nötig

- **GIVEN** `git ls-remote` findet den Archiv-Branch bereits auf origin (Idempotenz-Skip)
- **WHEN** die Archiv-Sektion übersprungen wird
- **THEN** findet kein Branch-Wechsel statt
- **AND** es wird kein Restore ausgeführt
