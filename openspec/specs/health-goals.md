# health-goals

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu health-goals ergänzen._

## Requirements

### Requirement: REQ-HEALTH-GOALS-001 — Single Source of Truth in goals.md

`.claude/lib/goals.md` SHALL be the sole authored source of truth for repository health goals. Every
consumer of goal data — the website dashboard (Homepage `#health` section, `/admin/repohealth`) and the
brain wiki — SHALL derive its content from `.claude/lib/goals.md`, either directly (brain ingest) or via
a generated artifact (website), never from a second hand-maintained copy of goal definitions.

#### Scenario: The website never hand-maintains a duplicate goal list

- **GIVEN** `website/src/lib/goals-data.ts`
- **WHEN** its source is inspected
- **THEN** it imports goal data from a generated JSON artifact rather than declaring goal entries as a
  literal in-source array

### Requirement: REQ-HEALTH-GOALS-002 — Generated Website Artifact

A generator script (`scripts/gen-goals-data.mjs`) SHALL parse `.claude/lib/goals.md` and emit
`website/src/lib/goals-data.generated.json`, an array of objects matching the `HealthGoal` TypeScript
interface (`id`, `title`, `category`, `priority`, `direction`, `baseline`, `current`, `target`, `unit`,
`status`, `measurement`, `source`, `measured_at`, optional `note`). The generator SHALL parse both goal
representations present in `goals.md`: individual `## G-<id> — <title>` sections carrying a
`**<priority> · Baseline:** … · **Target:** …` meta blockquote line (Priority A/B), and Markdown table
rows in the Green-Gates section (Priority C). Every emitted entry's `source` field SHALL read
`.claude/lib/goals.md · <id>`.

#### Scenario: An H2-section goal is parsed into the HealthGoal shape

- **GIVEN** a `## G-<id> — <title>` section in `.claude/lib/goals.md` with a well-formed meta
  blockquote line
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that `id`, correctly parsed `baseline`, `current`,
  and `target` numbers, and a `source` of `.claude/lib/goals.md · <id>`

#### Scenario: A Green-Gates table row is parsed into the HealthGoal shape

- **GIVEN** a Markdown table row in the Priority-C Green-Gates section of `.claude/lib/goals.md`
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that row's `id`, `priority: "C"`, and a `null`
  `baseline` (the table has no baseline column)

### Requirement: REQ-HEALTH-GOALS-003 — Freshness Gate

`website/src/lib/goals-data.generated.json` SHALL be a freshness-gated generated artifact: a
`health:goals:emit` Taskfile target SHALL run the generator, `task freshness:regenerate` SHALL include
that target, and `task freshness:check` SHALL fail if the committed
`website/src/lib/goals-data.generated.json` differs from a fresh regeneration.

#### Scenario: A stale generated goals JSON fails freshness:check

- **GIVEN** `.claude/lib/goals.md` was edited but `website/src/lib/goals-data.generated.json` was not
  regenerated and committed
- **WHEN** `task freshness:check` runs
- **THEN** it fails and names `website/src/lib/goals-data.generated.json` as stale

### Requirement: REQ-HEALTH-GOALS-004 — Fail-Loud Parsing

`scripts/gen-goals-data.mjs` SHALL exit non-zero and name the offending goal ID on stderr when it
encounters a structurally broken entry: a `## G-<id> — …` heading with no following meta blockquote
line before the next heading, a meta blockquote line whose `Baseline:` or `Target:` field contains no
digits and is not the literal token `n/a`, or a Green-Gates table row whose ID column does not match
`G-[A-Z0-9-]+`. Free-text baseline/target annotations that still contain extractable numbers (e.g.
`"3 (dev-flow-execute 662, infra-ops 595, …) → 1 (dev-flow-plan 508)"`) SHALL be tolerated via
first-number/last-number extraction rather than rejected.

#### Scenario: A goal section missing its meta-line fails the generator

- **GIVEN** a `## G-<id> — …` heading under a Priority A/B section with no meta blockquote line before
  the next heading
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits non-zero
- **AND** its stderr output names the offending `<id>`

#### Scenario: A messy but numeric baseline annotation is tolerated

- **GIVEN** a meta blockquote line whose `Baseline:` field is free text containing at least one number
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits `0` and extracts the first number found as the `baseline` value

<!-- merged from change delta health-goals.md (a840a7f1cb8b) -->

### Requirement: Maximum file size cap for VideoVault

The system SHALL enforce that VideoVault source files outside gate scope do not exceed 600 lines for more than 8 files.

#### Scenario: Verify VideoVault file size limit

- **GIVEN** the VideoVault codebase and tests/spec/g-size02-large-files.bats
- **WHEN** BATS runs the file size verification test
- **THEN** the number of files exceeding 600 lines MUST be less than or equal to 8.

<!-- merged from change delta health-goals.md (818aa74cfa1d) -->

### Requirement: G-OPS01-STATIC-001 — Brand-Secrets-Dateien enthalten alle vom Deployment referenzierten workspace-secrets-Keys

Jeder `secretKeyRef.key` mit `name: workspace-secrets`, der in einem `k3d/*.yaml`
Deployment referenziert wird, muss in der plaintext-Secrets-Datei JEDES Brands
vorhanden sein, für das dieses Deployment ausgerollt wird (nicht nur im Brand,
in dem der Key ursprünglich angelegt wurde).

#### Scenario: oauth2-proxy-terminal erfordert POCKET_ID_TERMINAL_SECRET in beiden Brands
GIVEN `k3d/oauth2-proxy-terminal.yaml` referenziert `POCKET_ID_TERMINAL_SECRET`
  über `secretKeyRef` gegen `workspace-secrets`
WHEN `environments/.secrets/korczewski.yaml` und
  `environments/.secrets/fleet-korczewski.yaml` gelesen werden
THEN enthalten beide Dateien den Key `POCKET_ID_TERMINAL_SECRET`

### Requirement: G-OPS01-STATIC-002 — Deployments mit ReadWriteOnce-PVC-Mount nutzen keine RollingUpdate-Strategie

Jedes in `k3d/` getrackte Deployment, das ein `PersistentVolumeClaim`-Volume
mountet, deklariert `spec.strategy.type: Recreate`, damit ein Rollout nicht
versucht, einen zweiten Pod auf einem anderen Node zu starten, während der alte
Pod die ReadWriteOnce-PVC noch hält (das führt zu endlosem `ContainerCreating`
des neuen Pods).

#### Scenario: livekit-egress ist als Kustomize-Manifest getrackt und nutzt Recreate
GIVEN `k3d/livekit-egress.yaml` existiert und ist als Resource in
  `k3d/kustomization.yaml` registriert
WHEN das Deployment `livekit-egress` daraus geparst wird
THEN ist `spec.strategy.type` gleich `Recreate`

<!-- merged from change delta health-goals.md (54f97d6a4e04) -->

### Requirement: G-DB09 measurement SHALL exclude one-time CREATE INDEX DDL statements from the slow-query count

The G-DB09 measurement query in `scripts/health-goals-check.sh` SHALL exclude `pg_stat_statements`
rows whose `query` text begins with `CREATE INDEX` (`query NOT ILIKE 'CREATE INDEX%'`), in addition
to the existing `COPY %` backup exclusion (T001926), because DDL maintenance statements — such as
one-time vector-index builds (`CREATE INDEX ... USING hnsw`) — are not repeated application queries
and their execution time is not a signal of application query performance.

#### Scenario: a one-time CREATE INDEX DDL statement with mean_exec_time > 1s is not counted as a "slow query"

- **GIVEN** `pg_stat_statements` contains a row for `CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops)` with `calls = 1` and `mean_exec_time > 1000`
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is excluded from the reported slow-query count

#### Scenario: a repeated application SELECT/DML statement with mean_exec_time > 1s is still counted

- **GIVEN** `pg_stat_statements` contains a row for an application `SELECT`/`INSERT`/`UPDATE`/`DELETE` statement with `mean_exec_time > 1000` and it is neither a `COPY` backup statement nor a `CREATE INDEX` DDL statement
- **WHEN** the G-DB09 measurement query runs
- **THEN** that row is still included in the reported slow-query count (the exclusion is narrowly scoped, not a broad DDL blocklist)

<!-- merged from change delta health-goals.md (2a82551a34a2) -->

### Requirement: REQ-HEALTH-GOALS-005 — Format-preserving cell-parser whitelist

`scripts/health-goals-update.sh` SHALL recognise, in addition to the bare-integer cell format
(`bare_int_re`), a whitelist of structured "Aktuell"-cell formats in the Priority-C Green-Gates table
and rewrite each in place while preserving its surrounding format — only the measured number is
replaced, the unit/prefix/suffix is retained, and the `✓`/`⚠` marker continues to be derived from the
existing `le`/`ge`/`eq` comparison. The whitelist SHALL cover: percent (`95 %`), exit-code (`Exit 0`),
unit-suffixed values (`22 h`, `6 Tage`, `~3587 Tage` — a leading `~` is dropped on rewrite), fractions
(`0/34`, where only the numerator is updated and the denominator is retained verbatim), and the
placeholder `n/a` (backfilled with the measured value once a measurement exists). Any cell that matches
none of these whitelist formats SHALL remain fail-safe in the `skipped_format` list, exactly as today.

#### Scenario: A percent cell is rewritten preserving its `%` suffix

- **GIVEN** a Priority-C row whose Aktuell cell reads `90 % ✓` and a measured value of `95` for that ID
- **WHEN** `scripts/health-goals-update.sh` runs with that measurement in `HG_VALUES_FILE`
- **THEN** the Aktuell cell is rewritten to `95 % <marker>` (the `%` suffix retained, marker derived
  from the comparison)

#### Scenario: A fraction cell updates only the numerator

- **GIVEN** a Priority-C row whose Aktuell cell reads `0/34 ✓` and a measured numerator of `3`
- **WHEN** `scripts/health-goals-update.sh` runs
- **THEN** the Aktuell cell is rewritten to `3/34 <marker>` (denominator `34` retained verbatim)

#### Scenario: A non-whitelisted cell stays fail-safe in skipped_format

- **GIVEN** a Priority-C row whose Aktuell cell reads free text such as `Elite`
- **WHEN** `scripts/health-goals-update.sh` runs
- **THEN** the cell is left unchanged and the ID is reported under "Übersprungen" (skipped_format)

### Requirement: REQ-HEALTH-GOALS-006 — Read-only drift report mode

`scripts/health-goals-update.sh --drift` SHALL emit a read-only report that joins the documented
`current` value of every goal (all priorities) from `website/src/lib/goals-data.generated.json` against
the freshly measured values in `HG_VALUES_FILE`, joined by goal ID, grouped by priority, marking each
divergence with a `DRIFT` label. The `--drift` mode SHALL always exit `0` and SHALL never write to
`.claude/lib/goals.md` — the Priority-A/B "human redaction" policy stays intact; the report only
surfaces the drift. When `website/src/lib/goals-data.generated.json` is older (mtime) than
`.claude/lib/goals.md`, the report SHALL print a staleness warning rather than silently joining against
stale documented values. The generated JSON remains the single parser SSOT (`gen-goals-data.mjs`,
REQ-HEALTH-GOALS-002); `--drift` SHALL NOT introduce a second `goals.md` parser.

#### Scenario: A documented value diverging from the measured value is flagged

- **GIVEN** a goal whose `current` in `goals-data.generated.json` is `5` and whose freshly measured
  value is `8`
- **WHEN** `scripts/health-goals-update.sh --drift` runs
- **THEN** the report lists that goal with both values and a `DRIFT` marker
- **AND** the process exits `0` and `.claude/lib/goals.md` is byte-for-byte unchanged

#### Scenario: A stale generated JSON produces a warning instead of a silent join

- **GIVEN** `goals-data.generated.json` whose mtime is older than `.claude/lib/goals.md`
- **WHEN** `scripts/health-goals-update.sh --drift` runs
- **THEN** the report prints a staleness warning naming `goals-data.generated.json`

### Requirement: REQ-HEALTH-GOALS-007 — LLM-assisted candidate fill via unified gateway

A new script `scripts/health-goals-llm-fill.sh` SHALL determine candidate goals as the set of IDs
present in `website/src/lib/goals-data.generated.json` but absent from the measurement run's
`HG_VALUES_FILE` (i.e. the deterministically uncovered goals), optionally narrowed by `--only=ID,ID`.
For each candidate it SHALL POST one OpenAI-compatible request to
`${HG_LLM_URL:-http://localhost:18235/v1}/chat/completions` (model `${HG_LLM_MODEL:-bonsai}`, the
unified LLM gateway from T002102, which serialises requests itself) expecting a strict JSON object
`{id, value, unit, confidence, evidence, reproducible_cmd_suggestion}`; a parse failure SHALL list the
goal as `unfillable` without a retry loop. The script SHALL default to report-only, writing the report
to stdout and to `tmp/claude-scratch/health-goals-llm-fill-<date>.md`. Under `--apply` it SHALL write
only Priority-C "Aktuell" cells, marking each written value with an `(LLM)` provenance marker, and SHALL
NEVER write Priority-A/B free text and NEVER apply a value whose `confidence` is below `0.7`. If the
gateway is unreachable the script SHALL exit `0` with a warning (cron-friendly), or exit `1` under
`--strict`.

#### Scenario: Candidate set is generated-IDs minus measured-IDs

- **GIVEN** `goals-data.generated.json` containing IDs `{G-A, G-B, G-C}` and an `HG_VALUES_FILE` that
  measured only `G-A`
- **WHEN** `scripts/health-goals-llm-fill.sh` runs
- **THEN** the candidate set is exactly `{G-B, G-C}`

#### Scenario: Report-only default never edits goals.md

- **GIVEN** a reachable mock gateway returning a valid JSON object with `confidence` `0.9`
- **WHEN** `scripts/health-goals-llm-fill.sh` runs without `--apply`
- **THEN** `.claude/lib/goals.md` is unchanged and a report file is written under `tmp/claude-scratch/`

#### Scenario: A low-confidence answer is never applied

- **GIVEN** a mock gateway returning `confidence` `0.4` for a candidate
- **WHEN** `scripts/health-goals-llm-fill.sh --apply` runs
- **THEN** that candidate's Priority-C cell is NOT written and the value is reported as report-only

#### Scenario: An unreachable gateway exits 0 by default and 1 under --strict

- **GIVEN** `HG_LLM_URL` pointing at a closed port
- **WHEN** `scripts/health-goals-llm-fill.sh` runs
- **THEN** it exits `0` and prints a warning
- **AND** WHEN run with `--strict` it exits `1`

<!-- merged from change delta health-goals.md (10c126152d2d) -->

### Requirement: REQ-HEALTH-GOALS-008 — Scheduled Measurement of Goal Values

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

### Requirement: REQ-HEALTH-GOALS-009 — Atomic Commit of SSOT and Generated Artifact

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

### Requirement: REQ-HEALTH-GOALS-010 — Measurement Date Comes From an Explicit Stamped Field

Das Messdatum steht als eigenes Feld `**Zuletzt gemessen:** \`<ISO>\`` im Kopf von
`.claude/lib/goals.md` und wird von `scripts/health-goals-update.sh` bei jedem Messlauf
gestempelt — auch dann, wenn kein einziger Wert sich geändert hat. Ein Lauf mit stabilen Werten
ist trotzdem eine frische Messung; an eine Wertänderung gekoppelt würde das Dashboard Stillstand
wie Aktualität aussehen lassen.

Vor T002598 wurde das Datum aus dem jüngsten `**Baseline-Update <datum>`-Marker der Chronik-Prosa
abgeleitet. Seit die Chronik in `docs/health-goals-history.md` liegt, gibt es dort nichts mehr zu
finden; die Ableitung wäre still auf den statischen `Baseline-Stichtag` zurückgefallen und hätte
ein Monat altes Datum als aktuell ausgewiesen, ohne dass ein Gate rot wird.

`scripts/gen-goals-data.mjs` SHALL read `measured_at` from the explicit
`**Zuletzt gemessen:** \`<ISO>\`` field. When that field is absent it SHALL fall back — in this
order — to the newest `**Baseline-Update <date>` marker by date comparison (legacy path, kept so
an un-migrated `goals.md` keeps working), then to the `Baseline-Stichtag` value.

`scripts/health-goals-update.sh` SHALL stamp the field whenever it processed at least one measured
value, and SHALL warn on stderr when the field is missing from the target file.

#### Scenario: Das explizite Feld bestimmt measured_at *(BATS)*

- **GIVEN** eine `goals.md` mit `**Zuletzt gemessen:** \`2026-08-03\``
- **WHEN** `scripts/gen-goals-data.mjs` läuft
- **THEN** tragen die erzeugten Einträge `measured_at: "2026-08-03"`

#### Scenario: Das explizite Feld schlägt einen älteren Legacy-Marker *(BATS)*

- **GIVEN** eine `goals.md` mit `**Zuletzt gemessen:** \`2026-08-03\`` im Kopf und einem
  `**Baseline-Update 2026-07-25`-Marker weiter unten
- **WHEN** `scripts/gen-goals-data.mjs` läuft
- **THEN** tragen die erzeugten Einträge `measured_at: "2026-08-03"`

#### Scenario: Ohne Feld und ohne Marker gilt der Baseline-Stichtag *(BATS)*

- **GIVEN** eine `goals.md` ohne das Feld und ohne jeden `**Baseline-Update`-Marker, aber mit
  `**Baseline-Stichtag:** \`2026-07-01\``
- **WHEN** `scripts/gen-goals-data.mjs` läuft
- **THEN** tragen die erzeugten Einträge `measured_at: "2026-07-01"`

#### Scenario: Ein Messlauf ohne Wertänderung stempelt trotzdem *(BATS)*

- **GIVEN** ein Messlauf, dessen Werte alle mit den dokumentierten übereinstimmen
- **WHEN** `scripts/health-goals-update.sh` läuft
- **THEN** ist `**Zuletzt gemessen:**` auf das Laufdatum aktualisiert

---

### Requirement: REQ-HEALTH-GOALS-011 — Register and Measurement Stay in Parity

`.claude/lib/goals.md` ist das Register (welche Ziele gelten), `scripts/health-goals-check.sh` ist
die Messung (wie sie geprüft werden). Bis T002598 prüfte niemand, ob beide dieselbe Menge führen —
dadurch sammelten sich **35 Ziele** an, die dokumentiert waren, aber nie gemessen wurden. Sie
zeigten dauerhaft den zuletzt von Hand eingetragenen Wert, weil `gen-goals-data.mjs` nichts misst,
sondern `goals.md` parst. Ein Ziel ohne `row()`-Aufruf ist damit für immer grün.

The test suite SHALL fail when a goal ID documented in `.claude/lib/goals.md` has no `row` call in
`scripts/health-goals-check.sh`, and SHALL equally fail when a `row` call measures an ID that is not
documented. Every such test SHALL carry a positive anchor asserting that the ID extraction found
known anchors, so a broken extraction fails loudly instead of yielding two empty sets and a
vacuously green comparison.

Die ID-Regex SHALL be `G-[A-Z0-9]+`. Das Muster `G-[A-Z]+[0-9]+` zerschneidet IDs mit Ziffern im
Präfix — `G-E2E01` wird zu `G-E2`, und `G-K8S01`–`04` fallen vollständig durch.

`.claude/lib/goals.md` SHALL carry at most **5** `Baseline-Update` entries; older ones belong in
`docs/health-goals-history.md`.

Ein Ziel SHALL NOT gleichzeitig als H2-Sektion und als Prio-C-Tabellenzeile geführt werden — die
Dublette erzeugt zwei Einträge im generierten Artefakt, von denen
`scripts/health-goals-update.sh` nur einen fortschreibt.

#### Scenario: Ein dokumentiertes Ziel ohne Messung schlägt fehl *(BATS)*

- **GIVEN** eine Ziel-ID in `.claude/lib/goals.md` ohne `row`-Aufruf in `health-goals-check.sh`
- **WHEN** `tests/spec/health-goals/id-parity.bats` läuft
- **THEN** schlägt der Paritätstest fehl und nennt die betroffene ID

#### Scenario: Eine Messung ohne Dokumentation schlägt fehl *(BATS)*

- **GIVEN** einen `row`-Aufruf für eine ID, die in `goals.md` fehlt
- **WHEN** `tests/spec/health-goals/id-parity.bats` läuft
- **THEN** schlägt der Paritätstest in der Gegenrichtung fehl

#### Scenario: Eine gebrochene ID-Extraktion meldet sich, statt still grün zu werden *(BATS)*

- **GIVEN** ein Register, in dem der bekannte Anker `G-K8S01` nicht mehr gefunden wird
- **WHEN** `tests/spec/health-goals/id-parity.bats` läuft
- **THEN** schlägt der Positiv-Anker-Test fehl

#### Scenario: Ein nicht ermittelbarer Messwert wird als SKIP ausgewiesen, nicht als 0 *(BATS)*

- **GIVEN** eine Messung, deren Werkzeug fehlt oder deren Netzaufruf scheitert
- **WHEN** `scripts/health-goals-check.sh` läuft
- **THEN** meldet die Zeile `n/a` (SKIP) statt eines Zahlenwerts, und weder Grün noch Rot

<!-- merged from change delta health-goals.md (a4a86ec5536e) -->

### Requirement: Kein handverwalteter Orphan-Workload darf ein Flux-Health-Gate blockieren

The system SHALL ensure that every Deployment running in `workspace` and
`workspace-korczewski` has a corresponding manifest under `k3d/` or a documented exception,
because a single unhealthy workload freezes the entire Flux Kustomization (T002207) and an
orphan created with `kubectl` is invisible to repository-side cleanup.

#### Scenario: Orphan detection reports kubectl-managed Deployments

- **GIVEN** a Deployment in `workspace` whose `metadata.managedFields[].manager` is `kubectl`
- **WHEN** the orphan audit is executed against the namespace
- **THEN** the Deployment is reported as unmanaged infrastructure drift
- **AND** the report names the namespace, the Deployment and the managing field manager

<!-- merged from change delta health-goals.md (3b7a7b7fe3d5) -->