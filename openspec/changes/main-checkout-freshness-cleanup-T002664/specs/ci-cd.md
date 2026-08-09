# ci-cd — Delta Spec

## Purpose

Definiert die Verhaltensregeln für Test-Inventar-Erfassung (`build-test-inventory.sh`) und Post-Merge-Freshness-Bereinigung (`.githooks/post-merge`), um verwaiste/ungetrackte Dateien und dirty State nach `git pull --ff-only` auf `main` zu verhindern.

## MODIFIED Requirements

### Requirement: FRESHNESS-001 — Test-Inventar discovery ignoriert .gitignore-Einträge

`scripts/build-test-inventory.sh` ermittelt Testdateien über `git ls-files` und `git ls-files --others --exclude-standard`, um ausgeschlossene (`.gitignore`) oder build-erzeugte Artefakte nicht in `test-inventory.json` aufzunehmen.

#### Scenario: Ignorierte Testdateien werden vom Inventar ignoriert
GIVEN eine Datei unter `tests/spec/` ist durch `.gitignore` ignoriert
WHEN `scripts/build-test-inventory.sh` ausgeführt wird
THEN erscheint die ignorierte Datei NICHT in `website/src/data/test-inventory.json`.

### Requirement: FRESHNESS-002 — Post-merge Hook stellt generierte Freshness-Artefakte wieder her

.githooks/post-merge stellt nach dem Ausführen von `freshness:regenerate` alle generierten Freshness-Artefakte (`test-inventory.json`, `repo-index.json` usw.) auf `HEAD` zurück.

#### Scenario: Post-merge hinterlässt sauberen main-Checkout
GIVEN ein `git pull --ff-only` läuft auf `main`
WHEN `.githooks/post-merge` beendet ist
THEN ist der Arbeitsbaum auf `main` vollständig sauber (keine uncommitted diffs auf `test-inventory.json` oder `repo-index.json`).
