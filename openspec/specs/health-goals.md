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

### Requirement: CORS ist fail-closed für unbekannte Origins

The system SHALL reject unknown origins in the CORS handling instead of falling open, so that
a request from an origin not on the allowlist is not granted cross-origin access.

#### Scenario: Unbekannte Origin wird abgelehnt

- **GIVEN** eine Anfrage trägt eine Origin, die nicht auf der Allowlist steht
- **WHEN** die CORS-Prüfung läuft
- **THEN** wird die Anfrage abgelehnt
- **AND** es wird kein `Access-Control-Allow-Origin` für die unbekannte Origin gesetzt

### Requirement: OIDC-Callback prüft returnTo gegen eine Allowlist

The system SHALL validate the `returnTo` parameter of the OIDC callback against an allowlist
of absolute URLs before redirecting, so that an open-redirect vector against the login flow is
closed. Absolute React URLs and the `state` parameter SHALL be handled without bypassing the
allowlist check.

#### Scenario: returnTo ohne Allowlist-Treffer wird abgelehnt

- **GIVEN** der OIDC-Callback erhält ein `returnTo` mit einer absoluten URL
- **WHEN** die Allowlist-Prüfung läuft
- **THEN** wird die URL nur akzeptiert, wenn sie auf der Allowlist steht
- **AND** eine nicht gelistete absolute URL führt zu keinem Redirect

#### Scenario: Absolute React-URL und state-Parameter sind abgedeckt

- **GIVEN** der Callback erhält eine absolute React-URL oder einen `state`-Parameter
- **WHEN** die Prüfung läuft
- **THEN** wird die Allowlist-Prüfung nicht umgangen
- **AND** der Redirect erfolgt nur auf erlaubte Ziele

### Requirement: korczewski-Secrets enthalten alle von oauth2-proxy-terminal benötigten Keys

The system SHALL provide every workspace-secrets key that `oauth2-proxy-terminal` requires in
the korczewski secrets files, so that the gate proxy for the terminal service is not
misconfigured on that brand.

#### Scenario: korczewski-Secrets sind vollständig

- **GIVEN** die korczewski-Secrets-Dateien werden geprüft
- **WHEN** sie gegen die von `oauth2-proxy-terminal` benötigten Keys abgeglichen werden
- **THEN** enthält jede Datei alle benötigten Keys
- **AND** es fehlt kein Key

#### Scenario: livekit-egress ist als Kustomize-Manifest getrackt

- **GIVEN** `livekit-egress` wird geprüft
- **WHEN** die Manifest-Ablage geprüft wird
- **THEN** ist es als Kustomize-Manifest getrackt
- **AND** es nutzt eine Recreate-Rollout-Strategie

<!-- merged from change delta health-goals.md (f38b85f730ca) -->

### Requirement: REQ-HEALTH-GOALS-LLM-001 — LLM stack operation goal family

The system SHALL define a goal family `G-LLM01` through `G-LLM05` in `.claude/lib/goals.md`
covering the operating state of the local LLM stack: model server availability, llm-proxy
readiness, configuration-versus-runtime model drift, autostart coverage of declared LLM stack
services, and dead local LLM endpoint references.

Each goal SHALL be measurable through a single command whose output is either a non-negative
integer or the literal `n/a`.

#### Scenario: Every family member is documented and measurable

- **GIVEN** `.claude/lib/goals.md` as the single source of truth for health goals
- **WHEN** the goal family is read
- **THEN** each of `G-LLM01`, `G-LLM02`, `G-LLM03`, `G-LLM04` and `G-LLM05` carries a title, a
  measurement command and a meta line with priority, baseline, target, effort, cycle,
  reproducibility and ticket reference
- **AND** each measurement command resolves to an invocation of `scripts/lib/llm-stack-measure.sh`

### Requirement: REQ-HEALTH-GOALS-LLM-002 — Positive anchor in every measurement

Every `G-LLM*` measurement SHALL emit `n/a` instead of a numeric value when its measurement
precondition is not satisfied, so that a missing measurement base is reported as skipped rather
than as a met target.

The preconditions are: for `G-LLM01` and `G-LLM03` a parseable loadout registry holding at least
one entry with a port, plus a llm-proxy answering on `/livez`; for `G-LLM02` a `/health` response
that parses as JSON and carries both a `ready` field and a `checked` count of at least one; for
`G-LLM04` an available service manager and at least one declared unit file; for `G-LLM05` a
backend registry query that returns at least one local endpoint.

A measurement SHALL NOT treat an absent, unparseable or unexpectedly shaped input as an empty
collection.

#### Scenario: Unparseable loadout registry reports n/a rather than zero

- **GIVEN** a loadout registry fixture that is not valid JSON
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A health payload without the expected fields reports n/a rather than zero

- **GIVEN** a llm-proxy fixture whose `/health` response carries neither a `degraded` list nor a
  `checked` count
- **WHEN** `scripts/lib/llm-stack-measure.sh proxy-readiness` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A populated measurement base still reports a number

- **GIVEN** a loadout registry fixture with at least one entry carrying a port and a reachable
  liveness endpoint
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed against it
- **THEN** the command prints a non-negative integer

### Requirement: REQ-HEALTH-GOALS-LLM-003 — Exclusive group aware availability

`G-LLM01` SHALL count a group of loadouts sharing an `exclusiveGroup` as available when at least
one member of that group answers its health endpoint, because members of such a group share one
GPU and cannot run simultaneously.

Loadouts without an `exclusiveGroup` SHALL be counted individually per port.

#### Scenario: One live member makes its exclusive group available

- **GIVEN** a loadout registry fixture with three entries in the same `exclusiveGroup` of which
  exactly one answers its health endpoint
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed
- **THEN** the reported count does not include that group

#### Scenario: A group without any live member is counted

- **GIVEN** a loadout registry fixture with two entries in one `exclusiveGroup`, neither of which
  answers its health endpoint, alongside a second group with a live member
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed
- **THEN** the reported count is 1

### Requirement: REQ-HEALTH-GOALS-LLM-004 — Numeric-only measurement output

Every `G-LLM*` measurement SHALL print either a non-negative integer or `n/a`, and SHALL NOT print
any other status word.

A llm-proxy reporting `ready: false` SHALL be expressed as the number of backends that cannot
serve, so the value stays comparable with the target and safe to append to `HG_VALUES_FILE`.

#### Scenario: A not-ready proxy yields a non-zero number rather than a status word

- **GIVEN** a llm-proxy fixture whose `/health` response carries `ready: false` and `checked: 3`
- **WHEN** `scripts/lib/llm-stack-measure.sh proxy-readiness` is executed against it
- **THEN** the command prints `3`
- **AND** the output matches an integer, not a word

### Requirement: REQ-HEALTH-GOALS-LLM-005 — Family boundary against the interface family

`G-LLM05` SHALL only consider endpoints declared by LLM stack artifacts, and SHALL exclude
endpoints declared in the MCP registry, because those are owned by `G-IF01`.

The boundary rule SHALL be the declaring artifact, not the failure mode.

#### Scenario: An endpoint declared in the MCP registry is not counted twice

- **GIVEN** a backend registry fixture listing a local endpoint without a listener that is also
  present in the MCP registry fixture
- **WHEN** `scripts/lib/llm-stack-measure.sh dead-endpoints` is executed
- **THEN** that endpoint is not included in the reported count
- **AND** a second local endpoint without a listener that appears only in the backend registry is
  included

### Requirement: REQ-HEALTH-GOALS-LLM-006 — Local measurement location

The `G-LLM*` family SHALL be measured locally through `task freshness:check` and SHALL NOT be
measured in CI, because a CI runner has no LLM endpoints and would report every goal as met.

When `CI` is set, `task freshness:check` SHALL print a skip note naming the reason and SHALL NOT
run the measurement. The measurement SHALL NOT change the exit status of `task freshness:check` in
either branch.

The goal identifiers of this family SHALL be appended to the existing `HG_LOCAL_ONLY_GOALS` list
rather than introducing a second warning block.

#### Scenario: CI run skips the family with a visible note

- **GIVEN** the environment variable `CI` is set
- **WHEN** `task freshness:check` is executed
- **THEN** the output contains a skip note for the local-only goals
- **AND** no `G-LLM*` measurement value is printed

#### Scenario: Local run reports the family without affecting the gate

- **GIVEN** the environment variable `CI` is unset
- **WHEN** `task freshness:check` is executed
- **THEN** the output contains the `G-LLM*` goal identifiers
- **AND** the exit status is the one the gate would have produced without the block

<!-- merged from change delta health-goals.md (f9df02d1fca8) -->

### Requirement: REQ-HEALTH-GOALS-WT-001 — Worktree and session hygiene goal family

The system SHALL define a goal family `G-WT01` through `G-WT06` in `.claude/lib/goals.md` covering
the local working state of the repository: main-checkout branch and cleanliness, stale worktrees,
worktrees holding unsaved work, orphaned agent-locks, phantom-scope agent-locks, and local `main`
divergence from `origin/main`.

Each goal SHALL be measurable through a single command whose numeric output is the goal value.

#### Scenario: Every family member is documented and measurable

- **GIVEN** `.claude/lib/goals.md` as the single source of truth for health goals
- **WHEN** the goal family is read
- **THEN** each of `G-WT01`, `G-WT02`, `G-WT03`, `G-WT04`, `G-WT05` and `G-WT06` carries a title,
  a measurement command and a meta line with priority, baseline, target, effort, cycle,
  reproducibility and ticket reference
- **AND** each measurement command resolves to an invocation of `scripts/lib/wt-hygiene-measure.sh`

### Requirement: REQ-HEALTH-GOALS-WT-002 — Positive anchor in every measurement

Every `G-WT*` measurement SHALL emit `n/a` instead of a numeric value when its measurement
precondition is not satisfied, so that a missing measurement base is reported as skipped rather
than as a met target.

The preconditions are: for `G-WT01` a resolvable main-checkout git directory; for `G-WT02` and
`G-WT04` at least one registered worktree and a resolvable `origin/main` reference; for `G-WT03`
and `G-WT06` an existing lock directory holding at least one well-formed lock; for `G-WT05` both a
local `main` and an `origin/main` reference plus a fetch not older than 24 hours.

#### Scenario: Empty measurement base reports n/a rather than zero

- **GIVEN** a repository fixture with no worktrees registered
- **WHEN** `scripts/lib/wt-hygiene-measure.sh stale-worktrees` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A populated measurement base still reports a number

- **GIVEN** a repository fixture with at least one registered worktree and a resolvable
  `origin/main` reference
- **WHEN** `scripts/lib/wt-hygiene-measure.sh stale-worktrees` is executed against it
- **THEN** the command prints a non-negative integer

### Requirement: REQ-HEALTH-GOALS-WT-003 — Heartbeat-based orphan detection

`G-WT03` SHALL classify an agent-lock as orphaned when its `owner_pid` no longer refers to a
running process OR when its `heartbeat_at` is older than twice the configured lock TTL, whichever
occurs first.

The measurement SHALL NOT rely on `owner_pid` alone, because process IDs are reused on a
long-running host, whereas a heartbeat that was never advanced is unambiguous.

#### Scenario: Never-advanced heartbeat is detected as orphaned

- **GIVEN** a lock fixture whose `heartbeat_at` equals its `created_at` and whose timestamp is
  older than twice the lock TTL
- **WHEN** `scripts/lib/wt-hygiene-measure.sh orphan-locks` is executed
- **THEN** the reported count includes that lock

#### Scenario: The live lock of the running session is not counted

- **GIVEN** a lock fixture with a running `owner_pid` and a heartbeat refreshed within the TTL
- **WHEN** `scripts/lib/wt-hygiene-measure.sh orphan-locks` is executed
- **THEN** the reported count does not include that lock

### Requirement: REQ-HEALTH-GOALS-WT-004 — Phantom-scope lock detection

`G-WT06` SHALL count agent-locks whose `scope` field is empty or begins with a hyphen, because such
a scope can only originate from a command-line flag that was consumed as a positional argument.

The measurement SHALL NOT validate the scope against a fixed list of known scope names, because
scope names are open-ended.

#### Scenario: A flag consumed as scope is counted

- **GIVEN** a lock fixture whose `scope` field holds a value beginning with a hyphen
- **WHEN** `scripts/lib/wt-hygiene-measure.sh phantom-scope-locks` is executed
- **THEN** the reported count includes that lock
- **AND** a lock with a well-formed scope in the same directory is not included

### Requirement: REQ-HEALTH-GOALS-WT-005 — Local-only measurement location

The `G-WT*` family SHALL be measured locally and SHALL NOT be evaluated as a CI gate, because a CI
runner has neither worktrees, nor agent-locks, nor a main checkout, which would render every goal
structurally green.

`task freshness:check` SHALL surface the family as a non-failing warning block when running
locally, and SHALL print a visible skip notice instead of a measurement when running in CI.

The warning block SHALL take its goal IDs from a parameterised list so that further local-only goal
families can be added to the same block.

#### Scenario: Local run surfaces the measurement

- **GIVEN** an environment where the `CI` variable is unset
- **WHEN** the local hygiene warning block executes
- **THEN** the output contains the reported `G-WT*` values
- **AND** the exit status is unaffected by those values

#### Scenario: CI run skips the measurement visibly

- **GIVEN** an environment where the `CI` variable is set
- **WHEN** the warning block executes
- **THEN** the output contains a skip notice naming the reason
- **AND** no `G-WT*` value is reported as met

<!-- merged from change delta health-goals.md (d1ba6426af7e) -->

### Requirement: REQ-HG-MEASURE-FAIL-LOUD-001

A health-goal measurement that cannot measure SHALL make that visible instead of
emitting a value indistinguishable from a real result. A measurement whose input
structure is absent, unparsable, or empty SHALL NOT report the goal as met, and
SHALL NOT be silently downgraded to "not measurable" when the cause is a broken
precondition rather than a legitimately unavailable environment.

#### Scenario: Registry structure no longer provides candidates

- **GIVEN** `docs/agent-guide/registry/mcp.yaml` contains no client with
  `transport: http`
- **WHEN** G-IF01 is measured
- **THEN** the reported value violates the goal's target and a diagnostic is
  written to stderr
- **AND** the goal is NOT reported as skipped or met

#### Scenario: Audit output cannot be parsed

- **GIVEN** `pnpm audit --json` emits output that is not valid JSON
- **WHEN** the G-DEP01 parser processes it
- **THEN** the parser exits non-zero
- **AND** it does NOT print `0`, which would read as "no high/critical
  vulnerabilities found"

#### Scenario: Legitimately unavailable environment stays skippable

- **GIVEN** `website/node_modules` is absent, as in the CI security-scan job
- **WHEN** G-DEP01 is measured
- **THEN** the goal is reported as not measurable
- **AND** no failure is raised, because the absent dependency tree is an
  environment property and not a defect

### Requirement: REQ-HG-MEASURE-ISOLATED-002

Measurement logic whose only execution path is a full check run SHALL be
extractable into a helper that accepts its input on stdin, so it can be verified
against fixtures without the runtime cost or environment prerequisites of the
real data source.

#### Scenario: Audit parser verified without a package manager run

- **GIVEN** a fixture containing a pretty-printed `pnpm audit --json` object with
  an `advisories` map holding one `high` and one `critical` entry
- **WHEN** the fixture is piped into `scripts/lib/pnpm-audit-count.py`
- **THEN** it prints `2` and exits zero

#### Scenario: Outdated parser survives a producer that exits non-zero

- **GIVEN** a producer that writes valid `pnpm outdated --format json` output and
  then exits 1, as pnpm does whenever outdated packages exist
- **WHEN** it is piped into `scripts/lib/pnpm-outdated-majors.py` under
  `set -uo pipefail`
- **THEN** the major-version count is printed as the sole output token
- **AND** no fallback token is appended after it

### Requirement: REQ-HG-MEASURE-PORTS-003

An endpoint-reachability measurement SHALL only consider registry entries that
declare a network endpoint. Entries started as a subprocess expose no port and
SHALL be excluded from both the numerator and the denominator.

#### Scenario: stdio clients are not counted as unreachable

- **GIVEN** the registry declares four `transport: http` clients and nine
  `transport: stdio` clients
- **WHEN** G-IF01 is measured while no local MCP server is listening
- **THEN** the reported count of dead endpoints is at most four

### Requirement: REQ-HG-GENERATED-JSON-PATH-004

Every component that reads the generated goals JSON SHALL reference the path the
generator actually writes. A reader that cannot find the file SHALL NOT terminate
with a success status.

#### Scenario: Reader path follows the generator

- **GIVEN** `scripts/gen-goals-data.mjs` writes to
  `website/src/lib/sdlc/goals-data.generated.json`
- **WHEN** `scripts/health-goals-update.sh`, `scripts/health-goals-llm-fill.sh`
  or `scripts/factory/auto-close-merged.sh` reference that artifact
- **THEN** each reference resolves to an existing file

<!-- merged from change delta health-goals.md (e5545f9c1e7a) -->

### Requirement: REQ-HEALTH-GOALS-AUDIT-001 — Audit-Runner als wiederholbarer Durchgang

`scripts/lib/zielfamilien-audit.sh` SHALL expose a `check` subcommand that evaluates every goal
measurement of a given family in `scripts/health-goals-check.sh` against a fixture corpus, and a
`list-families` subcommand that enumerates the audited families. `check` SHALL exit `0` when no
goal of the family violates an audit rule and exit `1` when at least one violation is found; per
goal it SHALL print one line `PASS <id>` or `FAIL <id> <rule>: <reason>` on stdout. The fixture
corpus SHALL be supplied via a `--fixture <dir>` option or the `ZF_AUDIT_FIXTURES` environment
variable, so the runner works without network, database or cluster access.

#### Scenario: A family with a violating goal exits non-zero

- **GIVEN** a fixture corpus where the `G-CQ02` measurement basis (directory `website/src`) is
  absent
- **WHEN** `scripts/lib/zielfamilien-audit.sh check --family CQ --fixture <corpus>` runs
- **THEN** it prints a `FAIL G-CQ02` line naming the existence-anchor rule
- **AND** exits `1`

#### Scenario: A clean family exits zero

- **GIVEN** a fixture corpus where every goal of family `DB` measures a real value against its
  basis
- **WHEN** `scripts/lib/zielfamilien-audit.sh check --family DB --fixture <corpus>` runs
- **THEN** it prints `PASS` lines only
- **AND** exits `0`

### Requirement: REQ-HEALTH-GOALS-AUDIT-002 — Fehlerklassen-Regeln

The audit runner SHALL implement at least the following rules, each mapped to the T002583/T002356
error class it detects:

- **E1 (M1 — vakuos grün):** a measurement that yields `0` or empty while its declared basis
  (file, field, endpoint, directory) is missing or empty SHALL be flagged.
- **E2 (SKIP-forever):** a measurement whose sole failure path is a catch-all fallback that
  returns the `-` skip sentinel SHALL be flagged unless a positive anchor distinguishes
  "basis missing" from "parse/format error".
- **E3 (toter Filter):** a measurement filtering on a key that does not exist in the fixture's
  real response SHALL be flagged.
- **E4 (Text im Vergleich):** a measurement that can emit a non-numeric value into
  `health-goals-check.sh`'s arithmetic comparison (`[ "$actual" -le "$target" ]`) SHALL be
  flagged.
- **E5 (Existenz-Anker):** a path/endpoint-based count (`grep`/`wc`/`find` over a directory or
  an HTTP call) without a preceding existence check SHALL be flagged — a vanished basis must not
  silently read as `0` = success.

#### Scenario: The M1 class is flagged before it reports green

- **GIVEN** a fixture where a goal's measurement counts `providers` in a response that only has a
  `degraded` list
- **WHEN** the runner evaluates that goal
- **THEN** it prints `FAIL <id> E1`
- **AND** never reports the goal as green

#### Scenario: A missing directory without anchor is flagged

- **GIVEN** a goal whose measurement greps `website/src` for `: any` and the directory does not
  exist in the fixture
- **WHEN** the runner evaluates that goal
- **THEN** it prints `FAIL <id> E5` (vanished basis → `0` would be vacuously green)

### Requirement: REQ-HEALTH-GOALS-AUDIT-003 — Committed Audit-Protokoll

`docs/health-goals/zielfamilien-audit.md` SHALL document the audit result per family in a table
(family, goals, verdict, error class, measure, status). Every family covered by the audit SHALL
have a row; families excluded (`G-LLM*` → T002442, `G-WT*` → T002443) SHALL be listed as excluded
with their ticket reference. The protocol SHALL be committed in the same PR as the goal changes it
documents, so the report survives OpenSpec archival and stays linkable from ticket T002584.

#### Scenario: Every audited family has a verdict row

- **GIVEN** the audit run over all in-scope families
- **WHEN** `docs/health-goals/zielfamilien-audit.md` is inspected
- **THEN** it contains one row per family with verdict `geprüft` and, for each found violation, the
  error class and the sharpening measure applied

### Requirement: REQ-HEALTH-GOALS-AUDIT-004 — Fixture-Suite als permanenter Guard

`tests/spec/health-goals/zielfamilien-audit.bats` SHALL run the audit runner against fixture
corpora in command-output verification mode (T002448-M4): an anchor test asserting the measurement
emits `n/a` (never `0`) when the basis is missing, and a violation test asserting the measurement
counts a prepared violation. The suite SHALL fail when a goal regresses into SKIP-forever or
vacuously-green behaviour. It SHALL run without network, database or cluster access.

#### Scenario: A regressed goal turns the suite red

- **GIVEN** a goal that after a later change measures `0` on a missing basis instead of `n/a`
- **WHEN** `tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/zielfamilien-audit.bats`
  runs
- **THEN** the anchor test for that goal fails

### Requirement: REQ-HEALTH-GOALS-AUDIT-005 — Schärfung nur fehlerhafter Ziele

A goal flagged by the audit SHALL be sharpened following the T002442 pattern: a positive anchor as
the first statement of its measurement (anchor failure ⇒ `n/a`, never `0`), one measurement source
per family where practical, and `n/a` instead of `0` for a missing basis. Goals that pass the audit
SHALL NOT be rewritten; their fixture tests serve as regression protection only. The sharpening
SHALL NOT change the merge-gate semantics of `health-goals-check.sh` for unrelated goals.

#### Scenario: A passing goal is left untouched

- **GIVEN** a goal whose measurement produces a real number against its fixture and passes all
  audit rules
- **WHEN** the audit fix commit is inspected
- **THEN** the goal's section in `.claude/lib/goals.md` and its `row` line in
  `scripts/health-goals-check.sh` are byte-for-byte unchanged

<!-- merged from change delta health-goals.md (a9274fd82115) -->