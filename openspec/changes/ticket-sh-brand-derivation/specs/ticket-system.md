## ADDED Requirements

### Requirement: CLI Brand Resolution Ist Nie Freitext-Abgeleitet

`scripts/ticket.sh` SHALL resolve the target brand (and therefore the target
namespace/database) exclusively from an explicit `--brand` flag, the `BRAND`
environment variable, or the `TICKET_NS` environment variable, in that priority
order. It SHALL NOT scan free-text argument values (such as `--title` or
`--description` contents) for brand name substrings. If none of the three
explicit signals is present, it SHALL fall back to the documented default brand
(`mentolder`) rather than inferring one from argument content.

#### Scenario: Freitext im Titel beeinflusst die Brand-Auflösung nicht

- **GIVEN** kein `--brand`-Flag, kein `BRAND`, kein `TICKET_NS` ist gesetzt
- **WHEN** `ticket.sh create --title "korczewski-home E2E test" ...` aufgerufen wird
- **THEN** wird die Ziel-Namespace/DB als `workspace` (mentolder-Default) aufgelöst, nicht als `workspace-korczewski`

#### Scenario: Explizites --brand gewinnt gegen widersprüchlichen Freitext

- **GIVEN** `--brand korczewski` ist explizit gesetzt
- **WHEN** `ticket.sh create --brand korczewski --title "mentolder rollout notes" ...` aufgerufen wird
- **THEN** wird die Ziel-Namespace/DB als `workspace-korczewski` aufgelöst

#### Scenario: Ungültiger Brand-Wert wird abgelehnt

- **GIVEN** `--brand acme` (weder mentolder noch korczewski)
- **WHEN** `ticket.sh` mit diesem Flag aufgerufen wird
- **THEN** bricht der Aufruf mit einem Fehler (`exit 2`) ab, ohne eine DB-Verbindung herzustellen

### Requirement: Brand-Spalte Und Ziel-Namespace Sind Dieselbe Quelle

`scripts/vda/ticket/create.sh` SHALL derive the `brand` column value for a new
ticket row from the same resolved brand value that `scripts/ticket.sh` used to
select the target namespace/database, not from an independent local default. An
explicit `--brand` override at the `create` subcommand level SHALL be validated
against the already-resolved top-level brand and SHALL fail loudly on mismatch
rather than silently taking precedence.

#### Scenario: Spalte und Namespace stimmen überein

- **GIVEN** `ticket.sh` hat die Ziel-Namespace bereits als `workspace-korczewski` aufgelöst
- **WHEN** `create.sh` ohne eigenes `--brand`-Override eine neue Zeile schreibt
- **THEN** ist die `brand`-Spalte der neuen Zeile `korczewski`, konsistent mit der Ziel-DB

#### Scenario: Divergierendes Subcommand-Override wird abgelehnt

- **GIVEN** der top-level aufgelöste Brand ist `korczewski`
- **WHEN** `create.sh --brand mentolder` (abweichender Wert) aufgerufen wird
- **THEN** bricht der Aufruf mit einem Fehler ab, statt die Zeile mit `brand=mentolder` in der korczewski-DB zu schreiben
