## ADDED Requirements

### Requirement: Pre-Commit-Freshness-Block blockiert bei Regenerationsfehler (nicht nur bei fehlendem Werkzeug)

Der Freshness-Block in `.githooks/pre-commit` SHALL zwischen zwei Fehlerfällen unterscheiden:
fehlt `task` oder `node` im PATH, bleibt der Block fail-open (keine Blockade, keine Warnung nötig
— die Toolchain ist schlicht nicht vorhanden). Ist die Toolchain vorhanden, aber
`task freshness:regenerate` schlägt fehl (Exit-Code ≠ 0), SHALL der Hook den Commit mit
`exit 1` blockieren statt den Commit mit einer reinen Warnung durchzulassen. Ein Notfall-Bypass
`SKIP_FRESHNESS_REGEN=1` SHALL existieren, konsistent mit den übrigen `SKIP_*`-Bypässen im
selben Hook.

#### Scenario: task vorhanden, freshness:regenerate schlägt fehl → Commit blockiert

- **GIVEN** `task` ist im PATH verfügbar und `task freshness:regenerate` beendet mit einem
  Exit-Code ungleich 0 (z. B. Timeout, `npm ci`-Fehler, Skriptfehler)
- **WHEN** ein `git commit` läuft, ohne dass `SKIP_FRESHNESS_REGEN=1` gesetzt ist
- **THEN** bricht `.githooks/pre-commit` mit einem non-zero Exit-Code ab und der Commit wird
  nicht erstellt

#### Scenario: task nicht im PATH → Hook bleibt fail-open (unverändertes Verhalten)

- **GIVEN** `task` ist nicht im PATH verfügbar
- **WHEN** ein `git commit` läuft
- **THEN** überspringt der Freshness-Block den Regen-Schritt vollständig und der Commit wird
  nicht blockiert (bestehendes Verhalten bleibt erhalten)

#### Scenario: SKIP_FRESHNESS_REGEN=1 umgeht die Blockade

- **GIVEN** `task freshness:regenerate` würde fehlschlagen
- **WHEN** ein `git commit` mit `SKIP_FRESHNESS_REGEN=1` läuft
- **THEN** wird der Commit trotz des Fehlschlags nicht blockiert (mit sichtbarer Warnung)
