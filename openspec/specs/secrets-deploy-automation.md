# secrets-deploy-automation

## Purpose

Verhindert eine Wiederholung des 2026-06-21-Incidents, bei dem 18 `POCKET_ID_*`-Secrets in Legacy-Dateien (`environments/sealed-secrets/mentolder.yaml`, `korczewski.yaml`) anstelle der aktiven Fleet-Dateien (`fleet-mentolder.yaml`, `fleet-korczewski.yaml`) versiegelt wurden. Drei Bausteine sichern das Setup ab: (1) ein neuer GitHub Action `deploy-sealed-secrets.yml` auto-deployt die Fleet-Dateien nach Merge auf `main`, (2) ein BATS-Guard prüft, dass die Fleet-Dateien eine Obermenge der Legacy-Dateien sind (minus `legacy_only: true` markierte Keys), und (3) `environments/schema.yaml` annotiert Legacy-only-Keys.

## Requirements

### Requirement: Auto-Deploy der Fleet-SealedSecrets

The system SHALL provide `.github/workflows/deploy-sealed-secrets.yml` which on push to `main` validates and applies `environments/sealed-secrets/fleet-*.yaml` to the fleet cluster (`kubectl apply -f` per file). The job MUST fail-closed if any `kubectl apply` errors.

#### Scenario: Merge auf main auto-deployt fleet-mentolder

- **GIVEN** ein PR mit Änderungen an `environments/sealed-secrets/fleet-mentolder.yaml` wurde auf `main` gemergt
- **WHEN** der `deploy-sealed-secrets` Workflow läuft
- **THEN** wendet er `fleet-mentolder.yaml` auf den Cluster an
- **AND** loggt jede `kubectl apply`-Ausgabe

### Requirement: Fleet-Vollständigkeits-Guard

The system SHALL provide `tests/spec/fleet-operations.bats` (BATS) that reads `environments/sealed-secrets/fleet-*.yaml` and `environments/sealed-secrets/*.yaml` (the legacy files) and asserts: for each key in the legacy file that is NOT marked `legacy_only: true` in `environments/schema.yaml`, the same key MUST exist in the corresponding fleet file.

#### Scenario: Legacy-Key ohne legacy_only fehlt in Fleet-Datei

- **GIVEN** `environments/sealed-secrets/mentolder.yaml` enthält `POCKET_ID_CLIENT_ID` und `POCKET_ID_CLIENT_ID` ist NICHT als `legacy_only: true` annotiert
- **WHEN** `fleet-operations.bats` ausgeführt wird
- **THEN** schlägt der Test fehl mit Hinweis auf den fehlenden Fleet-Key

#### Scenario: Legacy-only-Key darf fehlen

- **GIVEN** `WG_MESH_GEKKO2_PRIVATE_KEY` ist in `mentolder.yaml` und als `legacy_only: true` in `schema.yaml` annotiert
- **WHEN** `fleet-operations.bats` ausgeführt wird
- **THEN** besteht der Test (legacy-only-Keys sind erlaubt)

### Requirement: legacy_only-Annotation in environments/schema.yaml

The system SHALL annotate all keys that are intentionally only in the legacy sealed-secrets files with `legacy_only: true` in `environments/schema.yaml` (e.g. the WG Mesh keys). The annotation SHALL be parseable by the BATS fleet-completeness guard.

#### Scenario: Guard parses the legacy_only annotation

- **GIVEN** `environments/schema.yaml` marks a key (e.g. a WG Mesh key) with `legacy_only: true`
- **WHEN** the BATS fleet-completeness guard parses the schema
- **THEN** the key is recognized as legacy-only and excluded from the fleet-superset assertion

### Requirement: Reference-Doc zur SealedSecret-Architektur

The system SHALL provide `docs/superpowers/references/secrets-architecture.md` documenting the sealed-secrets file topology (`fleet-*.yaml` is the source of truth, `*.yaml` is the legacy location, the sync rule is one-way: `fleet-*.yaml` ⊇ `*.yaml` minus `legacy_only: true`).

#### Scenario: Reference doc exists and states the sync rule

- **GIVEN** the repository working tree
- **WHEN** reading `docs/superpowers/references/secrets-architecture.md`
- **THEN** the file exists
- **AND** documents `fleet-*.yaml` as source of truth and the one-way sync rule (`fleet-*.yaml` ⊇ `*.yaml` minus `legacy_only: true`)

### Requirement: Security-Agent Verweis auf SealedSecret-Architektur

The system SHALL add a §Secrets-Dateiarchitektur section in `.claude/agents/bachelorprojekt-security.md` pointing at the reference doc.

#### Scenario: Security agent links the architecture reference

- **GIVEN** the agent definition `.claude/agents/bachelorprojekt-security.md`
- **WHEN** searching it for a Secrets-Dateiarchitektur section
- **THEN** the section exists
- **AND** references `docs/superpowers/references/secrets-architecture.md`

<!-- from archive/2026-06-21-secrets-deploy-automation/tasks.md lines 1-100 -->

### Requirement: Sealed-Secrets-Parity-Test muss alle Dokumente eines Multi-Doc-YAML prüfen

Der Regressionstest, der Legacy- gegen Fleet-SealedSecrets vergleicht, SHALL alle
YAML-Dokumente einer Datei berücksichtigen, nicht nur das erste.

#### Scenario: Multi-Doc SealedSecret-Datei mit leeren Zwischendokumenten

- **GIVEN** eine `environments/sealed-secrets/<env>.yaml`-Datei mit mehreren durch `---`
  getrennten Dokumenten, darunter leere (`!!null`) Dokumente
- **WHEN** `tests/spec/fleet-operations.bats` die enthaltenen `encryptedData`-Keys sammelt
- **THEN** werden die Keys aus JEDEM nicht-leeren Dokument erfasst, nicht nur aus dem
  ersten

### Requirement: env-seal ordnet Shared-Namespace-Secrets über die Brand zu, nicht über den Env-Namen

`scripts/lib/seal-extra-namespaces.sh` SHALL den `owner_brand`-Filter gegen die aus
`environments/<ENV_NAME>.yaml` aufgelöste Brand (`env_vars.BRAND_ID`) prüfen, nicht gegen
den rohen `ENV_NAME`-String.

#### Scenario: Fleet-qualifizierter Env-Name mit abweichendem Brand-String

- **GIVEN** `ENV_NAME=fleet-mentolder` mit `environments/fleet-mentolder.yaml` →
  `env_vars.BRAND_ID: mentolder`, und ein Schema-Eintrag mit `owner_brand: [mentolder]`
- **WHEN** `task env:seal ENV=fleet-mentolder` läuft
- **THEN** wird das zugehörige Shared-Namespace-SealedSecret-Dokument versiegelt (nicht
  übersprungen)

#### Scenario: Legacy-Env ohne Fleet-Präfix bleibt unverändert

- **GIVEN** `ENV_NAME=mentolder` mit `env_vars.BRAND_ID: mentolder` (identisch zum
  Env-Namen)
- **WHEN** `task env:seal ENV=mentolder` läuft
- **THEN** verhält sich die Brand-Auflösung wie zuvor (kein Regressionsrisiko)

<!-- merged from change delta secrets-deploy-automation.md (f3e04f96561e) -->

### Requirement: Dev-Tool-Secret-SSOT

The system SHALL provide a single source of truth (SSOT) for developer tool secrets (`GITHUB_PERSONAL_ACCESS_TOKEN`, `BRAINTRUST_API_KEY`, `OPENCODE_API_KEY`) at `environments/.secrets/dev-tools.yaml`, encrypted at rest via git-crypt. Every harness config file (`dotfiles/agy/settings.json`, `dotfiles/opencode/config.json`, `~/.claude/settings.json`) MUST obtain these secrets from the SSOT — never store them inline.

#### Scenario: SSOT is the only file with secret values

- **GIVEN** the repository
- **WHEN** searching for `ghp_`, `github_pat_`, `sk-` (token prefix) in `dotfiles/agy/settings.json` and `dotfiles/opencode/config.json`
- **THEN** no matches are found
- **AND** the only file containing the actual token values is `environments/.secrets/dev-tools.yaml` (git-crypt encrypted)

#### Scenario: git-crypt protects the SSOT file

- **GIVEN** `environments/.secrets/dev-tools.yaml` is committed to the repository
- **WHEN** inspecting the file blob in the git index
- **THEN** the blob begins with the git-crypt magic header (`\x00GITCRYPT\x00`)
- **AND** `scripts/git-crypt-guard.sh check-tracked` reports it as encrypted

### Requirement: Bootstrap-Merge-Semantik

The system SHALL provide `dotfiles/install.sh` which reads the SSOT and injects secrets into harness configs via idempotent `jq` merge operations. The merge SHALL only set the specific secret fields, leaving all other configuration untouched. `dotfiles/install.sh` SHALL abort with a clear error message if the SSOT file is missing or unreadable.

#### Scenario: Bootstrap injects secrets into .claude/settings.json

- **GIVEN** `~/.claude/settings.json` exists with non-secret env fields configured
- **WHEN** `bash dotfiles/install.sh` runs
- **THEN** `.env.GITHUB_PERSONAL_ACCESS_TOKEN` and `.env.BRAINTRUST_API_KEY` are set in the file
- **AND** all other keys (permissions, hooks, non-secret env vars) remain unchanged

#### Scenario: Bootstrap is idempotent

- **GIVEN** a machine with bootstrapped configs
- **WHEN** `bash dotfiles/install.sh` runs a second time
- **THEN** no files are changed (exit code 0, identical content)

#### Scenario: Bootstrap aborts on missing SSOT

- **GIVEN** `environments/.secrets/dev-tools.yaml` does not exist
- **WHEN** `bash dotfiles/install.sh` runs
- **THEN** the script exits with a non-zero code
- **AND** prints a clear message instructing the user to unlock git-crypt first

### Requirement: gitleaks-Gegenscan

The system SHALL run `gitleaks` as a supplemental secret scan layer at two points: (1) the pre-commit hook (fail-open, warns if gitleaks is not installed) and (2) GitHub Actions CI (fail-closed, hard-fails on finding leaks). git-crypt-managed paths (`environments/.secrets/**`) SHALL be allowlisted in `.gitleaks.toml` because encrypted blobs produce false positives on entropy-based rules.

#### Scenario: gitleaks pre-commit warns without binary

- **GIVEN** a machine without `gitleaks` installed
- **WHEN** `git commit` triggers the pre-commit hook
- **THEN** a warning is printed that gitleaks is not installed
- **AND** the commit proceeds (exit 0)

#### Scenario: gitleaks CI fails on finding leaks

- **GIVEN** the CI Security Scan job runs
- **WHEN** `gitleaks detect` finds a potential secret
- **THEN** the job fails with a non-zero exit code
- **AND** the findings are printed in the CI log

#### Scenario: git-crypt paths are excluded from gitleaks

- **GIVEN** the `.gitleaks.toml` allowlist
- **WHEN** `gitleaks detect` scans the repository
- **THEN** files under `environments/.secrets/` (and other git-crypt paths) are not flagged
- **AND** the `.gitleaks.toml` comment explains why encrypted blobs are excluded

<!-- merged from change delta secrets-deploy-automation.md (de9391456594) -->