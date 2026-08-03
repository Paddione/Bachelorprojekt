## ADDED Requirements

### Requirement: Brand-Specific TURN IP Pinning

The system SHALL pin the TURN service subdomain to a brand-specific, statically configured IP
address that differs per brand, and SHALL never use worker node IPs for that service. The
former LiveKit pin is removed together with the LiveKit stack (T002184); `LIVEKIT_PIN_IP` is no
longer a recognised environment variable.

#### Scenario: mentolder TURN wird auf pk-hetzner-4 gepinnt

- **GIVEN** the environment configuration `environments/fleet-mentolder.yaml` is active
- **WHEN** the value `TURN_PUBLIC_IP` is read
- **THEN** it contains the pk-hetzner-4 control-plane IP
- **AND** the gekko worker IPs do NOT appear
- **AND** no `LIVEKIT_PIN_IP` key is present in the file

#### Scenario: korczewski DNS-Plan pinnt TURN auf den korczewski-spezifischen CP-Knoten

- **GIVEN** `PROD_DOMAIN=korczewski.de` and `TURN_PUBLIC_IP` are set
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the output contains the `turn` A-record for the brand-specific control-plane node
- **AND** the output contains no `livekit` and no `stream` A-record

### Requirement: DNS-Cutover-Plan enthält nur A-Records

The system SHALL emit only `A|` change lines from `fleet-dns-cutover.sh plan`, covering `@`,
`*` and `turn`, and SHALL NOT emit records for the removed `livekit` and `stream` subdomains.

#### Scenario: Plan-Ausgabe für mentolder enthält alle erforderlichen A-Records

- **GIVEN** `PROD_DOMAIN=mentolder.de` and `TURN_PUBLIC_IP` are set
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the output contains A-records for `@` (all three fleet IPs), `*` and `turn`
- **AND** every `CHANGE:` line starts with `A|` — no MX, TXT, CNAME or mail record is included
- **AND** neither `livekit` nor `stream` appears in the output

#### Scenario: Fehlende Pflicht-Umgebungsvariablen führen zu sofortigem Fehler

- **GIVEN** `PROD_DOMAIN` and `TURN_PUBLIC_IP` are unset
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the script exits with a non-zero exit code
- **AND** the error output contains the substring `not set`
