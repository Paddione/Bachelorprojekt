## MODIFIED Requirements

### Requirement: CI-Watch ist fail-closed bei null vorhandenen Checks

`scripts/devflow-ci-watch.sh` SHALL die Anzahl der Check-Runs für den beobachteten Commit
ermitteln, bevor es Erfolg meldet. Existieren **null** Check-Runs, SHALL das Skript mit
Exit-Code 5 abbrechen statt mit Exit-Code 0 Erfolg zu signalisieren. Ein Zustand ohne Checks
bedeutet „CI wurde nie gestartet oder läuft noch" — nicht „CI ist grün". Die Erfolgsmeldung
SHALL die tatsächliche Anzahl geprüfter Checks nennen, damit ein Null- oder Teilzustand für
Menschen wie für Automaten sichtbar ist.

Zusätzlich SHALL das Skript vor Eintritt in die Poll-Schleife prüfen, ob die beobachtete PR
bereits `state=MERGED` trägt. Ist dies der Fall, SHALL es sofort mit Exit-Code 0 erfolgreich
terminieren, ohne den blockierenden `gh pr checks --watch`-Aufruf zu erreichen — eine gemergte
PR hat ihre Checks per Branch-Protection bereits als grün bewiesen, ein erneutes Poll ist
sinnlos und kann für eine bereits geschlossene PR unbegrenzt blockieren.

Hintergrund: Beobachtet bei T002162/T002174 — ein PR mit `mergeStateStatus=CONFLICTING` hatte
über ~35 Minuten null Check-Runs, und das Skript meldete durchgehend „Alle CI-Checks grün"
mit Exit-Code 0. Das ist ein falsch-grünes Gate: die Merge-Pipeline hält einen ungeprüften
Stand für verifiziert. Zusätzlich beobachtet bei T002628/T002671: nach erfolgreichem
Auto-Merge blieb der Poll-Loop im blockierenden `gh pr checks --watch`-Aufruf hängen und
musste manuell beendet werden — es gab keinen Preflight für den bereits gemergten Zustand.

#### Scenario: Null Check-Runs führen zu Exit-Code 5 statt zu falschem Grün

- **GIVEN** für den beobachteten Commit meldet `gh api …/check-runs` `total_count = 0`
- **WHEN** `devflow-ci-watch.sh` seine Auswertung erreicht
- **THEN** bricht es mit Exit-Code 5 und der Meldung „Keine CI-Checks gefunden
  (total_count=0) — CI wurde nie gestartet oder läuft noch." ab
- **AND** meldet unter keinen Umständen Erfolg

#### Scenario: Die Erfolgsmeldung nennt die Anzahl der geprüften Checks

- **GIVEN** für den beobachteten Commit existieren N > 0 Check-Runs und alle sind grün
- **WHEN** `devflow-ci-watch.sh` Erfolg meldet
- **THEN** enthält die Meldung die konkrete Zahl N („N CI-Checks, alle grün") statt der
  pauschalen Formulierung „Alle CI-Checks grün"

#### Scenario: Ein konfliktbehafteter PR wird vor der Poll-Schleife abgefangen

- **GIVEN** ein PR steht auf `mergeStateStatus=CONFLICTING`
- **WHEN** `devflow-ci-watch.sh` startet
- **THEN** bricht der Preflight mit Exit-Code 4 ab, bevor die Poll-Schleife betreten wird

#### Scenario: Eine bereits gemergte PR terminiert erfolgreich, ohne den blockierenden Poll-Call zu erreichen

- **GIVEN** ein PR steht auf `state=MERGED`
- **WHEN** `devflow-ci-watch.sh` startet
- **THEN** terminiert es mit Exit-Code 0
- **AND** `gh pr checks --watch` wird zu keinem Zeitpunkt aufgerufen
