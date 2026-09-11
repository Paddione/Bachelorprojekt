# p4 — Delta-Specs nachziehen (impl)

_Ticket: T900120_ · Rolle `impl` · keine Abhängigkeit

Drei SSOT-Specs nennen den k3d-Context oder die entfallenden `sdlc:cluster:*`-Tasks, ohne dass
dieser Change bisher ein Delta für sie trägt. Nach der Archivierung dieses Changes prüft der
Guard `no-k3d-context.bats` auch `openspec/specs/` (vorher ist der Pfad ausgenommen, siehe Index
„Guard-Ausschlussliste"). Namenskonvention T001304: Delta-Datei heißt wie der Parent-SSOT-Slug.

### Task 4.1 — Requirement „No active reference" an die Ausschlussliste angleichen (≤20 min)

Datei: `openspec/changes/devmesh-k3d-decommission/specs/local-dev-mesh.md`

alt:
```markdown
The repository SHALL contain no reference to `k3d-mentolder-dev` outside
`openspec/changes/archive/`, `docs/superpowers/plans/`, `docs/superpowers/specs/archive/` and
`docs/adr/`. Context defaults in the factory and ticket tooling SHALL resolve to `fleet`.
```
neu:
```markdown
The repository SHALL contain no reference to `k3d-mentolder-dev` outside change records
(`openspec/changes/`, including `openspec/changes/archive/`), `docs/superpowers/plans/`,
`docs/superpowers/specs/archive/`, `docs/adr/`, the generated site `k3d/docs-content-built/`,
the immutable migration records under `scripts/migrations/` and the recorded ticket corpus
`tests/fixtures/mishap-dedupe-korpus.json`. While this change is not archived, `openspec/specs/`
is excluded as well, because its deltas replace the affected requirements on archive. Context
defaults in the factory and ticket tooling SHALL resolve to `fleet`.
```

### Task 4.2 — Delta `batch-factory-pipeline-robustness` (≤15 min)

Datei (neu): `openspec/changes/devmesh-k3d-decommission/specs/batch-factory-pipeline-robustness.md`

```markdown
## MODIFIED Requirements

### Requirement: The FACTORY_CTX default is visible immediately on sourcing lib.sh

`scripts/factory/lib.sh` SHALL resolve the `FACTORY_CTX` default (`fleet`, the ticket database of record per ADR-007) at top level, so that merely sourcing the file exposes a valid context. The default SHALL NOT wait until `factory_resolve_data_ns` runs, and the explicit override via `FACTORY_CTX` SHALL remain honored.

#### Scenario: Sourcing lib.sh alone exposes a valid context

- **GIVEN** an environment without `FACTORY_CTX` set
- **WHEN** a script sources `scripts/factory/lib.sh`
- **THEN** `FACTORY_CTX` is already `fleet` without calling `factory_resolve`
- **AND** a later explicit `FACTORY_CTX=...` override still wins
```

### Task 4.3 — Delta `ticket-system` (≤20 min)

Datei (neu): `openspec/changes/devmesh-k3d-decommission/specs/ticket-system.md`

```markdown
## MODIFIED Requirements

### Requirement: backfill-id BATS-Verhaltenstests laufen bei erreichbarem Cluster tatsächlich

`tests/spec/ticket-system/backfill-id-sequence.bats` SHALL den unter Test stehenden Befehl
(`scripts/ticket.sh backfill-id`) gegen den über `FACTORY_CTX` gewählten, erreichbaren Cluster
tatsächlich ausführen, statt sich über den fail-closed BATS-Guard aus
`scripts/vda/ticket/_ticket-core.sh` (T002224, Sentinel-Kontext `bats-no-cluster-t002224`) selbst
zu blockieren. Ohne gesetztes `FACTORY_CTX` zeigt der Test auf `devmesh`; weil das Ticket-Tooling
dort Schreibzugriffe verweigert, SHALL er die Verhaltenstests dann mit dieser Begründung
überspringen statt zu scheitern.

#### Scenario: Verhaltenstests opten sich explizit in echten Cluster-Zugriff ein

- **GIVEN** ein Checkout mit gesetztem `FACTORY_CTX`, dessen Cluster erreichbar ist und
  Ticket-Writes zulässt
- **WHEN** `tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats`
  läuft
- **THEN** setzt `setup()` `export TICKET_TEST_DB_OK=1`, sodass `scripts/ticket.sh backfill-id`
  mit dem im Test übergebenen `--brand`-Kontext gegen den echten `shared-db`-Pod läuft
- **AND** alle drei Tests (`assigns an external_id`, `reports the number of rows`,
  `an empty backfill-id run says so`) enden mit Exit-Code 0 und den dokumentierten
  Positiv-Ankern (`^T[0-9]{6}$`, `^backfill-id: [0-9]+ Zeile`, `^backfill-id: 0 Zeilen ohne
  external_id`)

#### Scenario: Ohne FACTORY_CTX wird devmesh nicht beschrieben

- **GIVEN** `FACTORY_CTX` ist nicht gesetzt
- **WHEN** die Datei läuft
- **THEN** werden die Verhaltenstests übersprungen und nennen `devmesh` als Grund
```

### Task 4.4 — Delta `sdlc-cockpit` (≤20 min)

Datei (neu): `openspec/changes/devmesh-k3d-decommission/specs/sdlc-cockpit.md`

```markdown
## RENAMED Requirements

### Requirement: Dev-Deployment — SDLC-Console auf mentolder-dev-Cluster

**Renamed-to:** Dev-Deployment — SDLC-Console auf dem devmesh-Cluster

## MODIFIED Requirements

### Requirement: Dev-Deployment — SDLC-Console auf dem devmesh-Cluster

Das Repository SHALL einen ausführbaren Deployment-Pfad bereitstellen, der das SDLC-Cockpit als
Entwicklungsinstanz auf dem k3s-Cluster `devmesh` erreichbar macht (`task devmesh:deploy`,
danach `task sdlc:sdlc:up`). Kein SDLC-Task SHALL dafür einen Cluster anlegen. Das Ergebnis SHALL
per BATS-Test nachgewiesen sein, nicht per Behauptung.

#### Scenario: SDLC-Stack ist deployed und erreichbar

- **GIVEN** der `devmesh`-Cluster läuft und der Stack wurde per `devmesh:deploy` ausgerollt
- **WHEN** das Cockpit der Entwicklungsinstanz aufgerufen wird
- **THEN** antwortet die SDLC-Console mit HTTP 200 oder einem gültigen Auth-Redirect
- **AND** der BATS-Test `tests/spec/cockpit-availability/*.bats` läuft grün

#### Scenario: Cluster-Ziel ist dokumentiert

- **GIVEN** die Deployment-Doku des SDLC-Stacks
- **WHEN** der Zielcluster nachgeschlagen wird
- **THEN** heißt er `devmesh` und der Ausführungspfad ist `task devmesh:deploy` gefolgt von `task sdlc:sdlc:up`
```

### Task 4.5 — Validieren (≤10 min)

```bash
bash scripts/openspec.sh validate
# RENAMED-Quelle muss im SSOT existieren (sonst schlaegt archive fehl):
grep -c '^### Requirement: Dev-Deployment — SDLC-Console auf mentolder-dev-Cluster$' openspec/specs/sdlc-cockpit.md   # 1
grep -c '^### Requirement: backfill-id BATS-Verhaltenstests laufen bei erreichbarem Cluster tatsächlich$' openspec/specs/ticket-system.md   # 1
grep -c '^### Requirement: The FACTORY_CTX default is visible immediately on sourcing lib.sh$' openspec/specs/batch-factory-pipeline-robustness.md   # 1
grep -c 'k3d-mentolder-dev' openspec/changes/devmesh-k3d-decommission/specs/batch-factory-pipeline-robustness.md openspec/changes/devmesh-k3d-decommission/specs/ticket-system.md openspec/changes/devmesh-k3d-decommission/specs/sdlc-cockpit.md   # je 0
```
