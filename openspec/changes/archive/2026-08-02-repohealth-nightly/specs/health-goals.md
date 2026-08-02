## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-005 — Scheduled Measurement of Goal Values

Die vier bestehenden Requirements dieser Spec beschreiben, wie Goal-Werte aus
`.claude/lib/goals.md` **abgeleitet** werden (SSOT, Generator, Freshness-Gate, Fail-Loud) — aber
nicht, wie sie **entstehen**. `scripts/gen-goals-data.mjs` misst nichts; es parst die SSOT.
Solange niemand `goals.md` fortschreibt, erzeugt jeder Regenerate-Lauf bitgleiche Ausgabe, sieht
keinen Diff und committet nichts. Die Pipeline bleibt grün und liefert eingefrorene Werte
(T002162: `G-SIZE03` stand tagelang auf 1939, obwohl die Datei auf 311 Zeilen geschrumpft war).

A scheduled CI workflow SHALL run the live measurement (`task health:goals:update`) and write the
resulting values into `.claude/lib/goals.md`. It SHALL measure without the `--fast` flag, because
`db_scalar()` short-circuits to the `"-"` skip sentinel in fast mode and would silently leave every
database goal at its documented value. The workflow SHALL be scheduled ahead of any consumer that
derives work from these values.

#### Scenario: T002162-A: der nightly Workflow misst vor dem Quality-Loop *(BATS)*

- **GIVEN** `.github/workflows/health-goals.yml` ist vorhanden
- **WHEN** sein `schedule`-Trigger geprüft wird
- **THEN** enthält er `cron: "0 1 * * *"`
- **AND** `quality-loop.yml` läuft mit `cron: "0 2 * * *"` danach, sodass die daraus abgeleiteten
  CQ-GATE-Tickets auf frisch gemessenen Werten beruhen

#### Scenario: T002162-B: die Messung läuft vollständig, nicht im Fast-Modus *(BATS)*

- **GIVEN** `.github/workflows/health-goals.yml` ist vorhanden
- **WHEN** seine wirksame Konfiguration (ohne YAML-Kommentarzeilen) geprüft wird
- **THEN** enthält sie `--full`
- **AND** sie enthält kein `--fast`

#### Scenario: Eine nicht durchführbare Messung überschreibt keinen Wert

- **GIVEN** ein Health-Goal, dessen Mess-Befehl das benötigte Werkzeug oder den Cluster nicht
  erreichen kann
- **WHEN** `scripts/health-goals-check.sh` es auswertet
- **THEN** liefert die Messfunktion den Sentinel `"-"`, `row()` zählt es als `SKIP` und schreibt
  keine Zeile in `HG_VALUES_FILE`
- **AND** `scripts/health-goals-update.sh` lässt den dokumentierten Wert unverändert stehen,
  statt ihn fälschlich auf einen Erfolgswert zu setzen

---

### Requirement: REQ-HEALTH-GOALS-006 — Atomic Commit of SSOT and Generated Artifact

Schreibt ein unbeaufsichtigter Workflow `.claude/lib/goals.md` fort, ohne
`website/src/lib/goals-data.generated.json` im selben Commit nachzuziehen, entsteht auf `main` ein
Zeitfenster, in dem die Freshness-Invariante aus REQ-HEALTH-GOALS-003 verletzt ist. In diesem
Fenster schlägt `task freshness:check` in der CI **fremder** Pull Requests fehl, mit einem Verweis
auf ein Artefakt, das deren Autoren nie angefasst haben.

The scheduled measurement workflow SHALL run the generator in the same job and commit
`.claude/lib/goals.md` together with `website/src/lib/goals-data.generated.json` in a single
commit. That commit SHALL NOT carry a `[skip ci]` marker, because it touches `website/**` and must
trigger the website image build that delivers the new values to the dashboard.

#### Scenario: T002162-C: SSOT und Artefakt werden atomar committet *(BATS)*

- **GIVEN** `.github/workflows/health-goals.yml` ist vorhanden
- **WHEN** seine wirksame Konfiguration geprüft wird
- **THEN** enthält sie einen `health:goals:emit`-Aufruf
- **AND** sie stellt `website/src/lib/goals-data.generated.json` explizit für den Commit bereit

#### Scenario: T002162-D: der Commit unterdrückt den Website-Build nicht *(BATS)*

- **GIVEN** `.github/workflows/health-goals.yml` ist vorhanden
- **WHEN** seine wirksame Konfiguration (ohne YAML-Kommentarzeilen) geprüft wird
- **THEN** enthält sie kein `[skip ci]`

---

### Requirement: REQ-HEALTH-GOALS-007 — Measurement Date Reflects the Newest Update

Die `**Baseline-Update <datum>`-Marker in `.claude/lib/goals.md` stehen thematisch sortiert —
Prio-A-Abschnitt oben, Prio-B/C-Historie unten — nicht chronologisch. Der letzte Marker in
Dokument-Reihenfolge ist deshalb nicht der jüngste.

`scripts/gen-goals-data.mjs` SHALL derive the `measured_at` field from the newest
`**Baseline-Update <date>` marker by date comparison, not from the last occurrence in document
order. When no such marker exists, it SHALL fall back to the `Baseline-Stichtag` value.

#### Scenario: T002162-E: das jüngste Datum gewinnt gegen die Dokument-Reihenfolge *(BATS)*

- **GIVEN** eine `goals.md` mit einem `**Baseline-Update 2026-07-25`-Marker oberhalb eines
  `**Baseline-Update 2026-07-22`-Markers
- **WHEN** `scripts/gen-goals-data.mjs` läuft
- **THEN** tragen die erzeugten Einträge `measured_at: "2026-07-25"`

#### Scenario: Ohne Update-Marker gilt der Baseline-Stichtag *(BATS)*

- **GIVEN** eine `goals.md` ohne jeden `**Baseline-Update`-Marker, aber mit
  `**Baseline-Stichtag:** \`2026-07-01\``
- **WHEN** `scripts/gen-goals-data.mjs` läuft
- **THEN** tragen die erzeugten Einträge `measured_at: "2026-07-01"`
