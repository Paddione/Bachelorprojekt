## MODIFIED Requirements

### Requirement: PR-Gate — Conventional Commits und Ticket-Tag

The system SHALL enforce that every PR title follows the Conventional Commits format (`type(scope): subject`)
and SHALL advisory-warn if no ticket tag `[T000XXX]` is present. The allowed scope list used by this gate,
by the PR-auto-title fallback, and by the local pre-push/pre-PR helpers SHALL be sourced dynamically from a
single source of truth (`commitlint.config.cjs` `rules.scope-enum`, exposed via
`scripts/validate-commit-msg.sh scopes`) instead of independently hardcoded copies.

#### Scenario: PR-Titel ohne gültigen Typ wird abgewiesen

- **GIVEN** ein PR hat den Titel `update readme`
- **WHEN** der `commit-lint`-Job via `action-semantic-pull-request` prüft
- **THEN** schlägt der Check fehl und der Merge ist blockiert

#### Scenario: PR-Titel ohne Ticket-Tag erzeugt nur Warnung

- **GIVEN** ein PR hat den Titel `feat(website): improve hero section`
- **WHEN** der Ticket-Tag-Check ausgeführt wird
- **THEN** gibt der Schritt eine `⚠️`-Meldung aus, bricht aber nicht ab

#### Scenario: commit-lint-Job lädt Scopes dynamisch statt hartcodiert *(BATS)*

- **GIVEN** der `commit-lint`-Job in `.github/workflows/ci.yml`
- **WHEN** der Job die `amannn/action-semantic-pull-request`-Action mit einer Scope-Liste aufruft
- **THEN** stammt die Liste aus einem vorgeschalteten Schritt, der `bash scripts/validate-commit-msg.sh scopes`
  ausführt und das Ergebnis über `$GITHUB_OUTPUT` bereitstellt — keine separat gepflegte Inline-Liste mehr

### Requirement: Preflight-PR-Scope-Validierung
<!-- bats: preflight-pr-scope.bats -->

The system SHALL validate PR title scopes against the SSOT scope list (`scripts/validate-commit-msg.sh scopes`,
backed by `commitlint.config.cjs`) before `gh pr create` and SHALL exit 0 for valid scopes, exit non-zero with an
allowlist hint for unknown scopes, and exit 2 if neither the given workflow file nor the SSOT scope source is
available. Parsing an explicitly-supplied workflow file with a literal `scopes: |` block (e.g. a test fixture)
SHALL continue to take precedence over the SSOT fallback, preserving existing callers that pass a static fixture.

#### Scenario: Gültiger Scope besteht die Validierung *(BATS)*
- **GIVEN** ein PR-Titel `feat(admin): add dashboard` und eine `ci.yml`-Fixture mit `admin` im Scope-Allowlist
- **WHEN** `scripts/preflight-pr-scope.sh` mit Titel und Workflow-Pfad aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0

#### Scenario: Ungültiger Scope schlägt fehl mit Allowlist-Hinweis *(BATS)*
- **GIVEN** ein PR-Titel `feat(cockpit): add view` wobei `cockpit` nicht im Allowlist steht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0 und gibt "NOT in the semantic-PR allowlist" sowie die erlaubten Scopes aus

#### Scenario: Scope-loser Titel wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `docs: update readme` ohne Scope-Klammer
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 und gibt einen "no scope"-Hinweis aus

#### Scenario: Fehlende Workflow-Datei liefert Exit-Code 2 *(BATS)*
- **GIVEN** der angegebene Workflow-Pfad `/nonexistent/ci.yml` existiert nicht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 2

#### Scenario: Gültiger Scope mit Breaking-Change-Marker wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `feat(db)!: breaking schema` mit `!` nach dem Scope
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 — der Breaking-Change-Marker beeinflusst die Scope-Validierung nicht

#### Scenario: ci.yml ohne literalen `scopes:`-Block fällt auf die SSOT-Quelle zurück
- **GIVEN** `.github/workflows/ci.yml` enthält nach der T001364-Umstellung nur noch
  `scopes: ${{ steps.load-scopes.outputs.scopes }}` statt eines literalen `scopes: |`-Blocks
- **WHEN** `scripts/preflight-pr-scope.sh "<titel>"` ohne expliziten zweiten Pfad-Parameter (Default `ci.yml`) aufgerufen wird
- **THEN** parst das Skript keine leere Liste, sondern fällt auf `bash scripts/validate-commit-msg.sh scopes` zurück und
  validiert korrekt

## ADDED Requirements

### Requirement: Scope-Registrierung via register-scope.sh

The system SHALL provide `scripts/register-scope.sh <scope>` to idempotently add a new scope to the SSOT
(`commitlint.config.cjs` `rules.scope-enum`). It SHALL reject scopes that do not match `^[a-z0-9][a-z0-9-]*$`,
SHALL reject scopes already present in the enum (exit non-zero, no file mutation), and SHALL exit 0 after
inserting a genuinely new scope. An optional `--config <path>` flag SHALL redirect the target file for testing
without mutating the real `commitlint.config.cjs`.

#### Scenario: Neuer Scope wird erfolgreich registriert *(BATS)*
- **GIVEN** `bats-test-scope-xyz` ist noch nicht in `commitlint.config.cjs` `scope-enum` enthalten
- **WHEN** `scripts/register-scope.sh bats-test-scope-xyz --config <tmp-kopie>` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 und die Zieldatei enthält `bats-test-scope-xyz`

#### Scenario: Bereits registrierter Scope wird abgelehnt *(BATS)*
- **GIVEN** `website` ist bereits in `scope-enum` enthalten
- **WHEN** `scripts/register-scope.sh website --config commitlint.config.cjs` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0 und die Datei bleibt unverändert (kein doppelter Eintrag)

#### Scenario: Ungültiges Scope-Format wird abgelehnt *(BATS)*
- **GIVEN** ein Scope-Kandidat `Not_Valid!` verstößt gegen `^[a-z0-9][a-z0-9-]*$`
- **WHEN** `scripts/register-scope.sh "Not_Valid!"` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0

### Requirement: PR-Auto-Title validiert abgeleiteten Scope gegen SSOT

The system SHALL check out the repository in `.github/workflows/pr-auto-title.yml` before deriving a scope from
the branch name, and SHALL validate the derived scope against `bash scripts/validate-commit-msg.sh scopes`
before composing the new PR title. An unrecognised scope SHALL be discarded (title falls back to `type: subject`)
instead of being written into the title.

#### Scenario: Abgeleiteter Scope ist in der SSOT-Liste enthalten
- **GIVEN** ein Branch `feature/fe03-something` liefert den abgeleiteten Scope `fe03`
- **WHEN** `fe03` in der Ausgabe von `bash scripts/validate-commit-msg.sh scopes` enthalten ist
- **THEN** wird der Titel als `feat(fe03): something` komponiert (bestehendes Verhalten unverändert)

#### Scenario: Abgeleiteter Scope ist nicht registriert
- **GIVEN** ein Branch `feature/xy09-something` liefert den abgeleiteten Scope `xy09`
- **WHEN** `xy09` NICHT in der Ausgabe von `bash scripts/validate-commit-msg.sh scopes` enthalten ist
- **THEN** wird `SCOPE` auf einen leeren Wert zurückgesetzt und der Titel fällt auf `feat: something` zurück —
  kein erfundener Scope landet im Titel
