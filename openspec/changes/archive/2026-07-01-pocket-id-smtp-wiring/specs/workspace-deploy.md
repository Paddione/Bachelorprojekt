## ADDED Requirements

### Requirement: Pocket-ID erhält vollständige SMTP-Konfiguration in jedem Deploy-Pfad

Das System SHALL bei jedem `task workspace:deploy`- und `task workspace:partial-deploy`-Lauf
(unabhängig von `ENV`) `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` und einen abgeleiteten
`POCKET_ID_SMTP_TLS`-Modus (`none`|`starttls`|`tls`) korrekt in den Pocket-ID-Container
envsubst'en. `POCKET_ID_SMTP_TLS` SHALL deterministisch aus `SMTP_SECURE` und `SMTP_PORT`
hergeleitet werden (`SMTP_SECURE=true` → `tls`; `SMTP_PORT=587` → `starttls`; sonst `none`),
ohne dass Env-Dateien ein neues Pflichtfeld benötigen.

#### Scenario: Prod-Deploy substituiert SMTP_USER korrekt

- **GIVEN** `environments/mentolder.yaml` (oder `korczewski.yaml`) setzt `SMTP_USER`
- **WHEN** `task workspace:deploy ENV=mentolder` (oder `ENV=korczewski`) läuft
- **THEN** enthält das gerenderte Pocket-ID-Deployment-Manifest den echten `SMTP_USER`-Wert
  aus der Env-Datei, nicht den literalen String `"${SMTP_USER}"`

#### Scenario: Partial-Deploy spiegelt denselben SMTP-Contract

- **GIVEN** `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=pocket-id` läuft
- **WHEN** das Pocket-ID-Manifest gerendert wird
- **THEN** sind `SMTP_USER` und `POCKET_ID_SMTP_TLS` identisch zu dem, was
  `task workspace:deploy ENV=mentolder` für denselben Service rendern würde

#### Scenario: TLS-Modus wird korrekt aus SMTP_SECURE + SMTP_PORT hergeleitet

- **GIVEN** eine Env-Datei mit `SMTP_SECURE: "false"` und `SMTP_PORT: "587"` (z. B. mentolder,
  korczewski gegen `smtp.mailbox.org`)
- **WHEN** ein Deploy-Task für diese Env läuft
- **THEN** wird der Pocket-ID-Container-Env `SMTP_TLS=starttls` gesetzt

- **GIVEN** eine Env-Datei mit `SMTP_PORT: "1025"` (Dev, Mailpit) und `SMTP_SECURE: "false"`
- **WHEN** `task workspace:deploy ENV=dev` läuft
- **THEN** wird der Pocket-ID-Container-Env `SMTP_TLS=none` gesetzt
