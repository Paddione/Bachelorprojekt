## MODIFIED Requirements

### Requirement: Pocket-ID erhält vollständige SMTP-Konfiguration in jedem Deploy-Pfad

Das System SHALL bei jedem `task workspace:deploy`- und `task workspace:partial-deploy`-Lauf
(unabhängig von `ENV`) `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` und einen abgeleiteten
`POCKET_ID_SMTP_TLS`-Modus (`none`|`starttls`|`tls`) korrekt in den Pocket-ID-Container
envsubst'en. `POCKET_ID_SMTP_TLS` SHALL deterministisch aus `SMTP_SECURE` und `SMTP_PORT`
hergeleitet werden (`SMTP_SECURE=true` → `tls`; `SMTP_PORT=587` → `starttls`; sonst `none`),
ohne dass Env-Dateien ein neues Pflichtfeld benötigen. Insbesondere `SMTP_PORT` SHALL in
JEDEM der drei Deploy-Codepfade (Dev-Zweig von `workspace:deploy`, Prod-Zweig von
`workspace:deploy`, `workspace:partial-deploy`) tatsächlich in der jeweiligen envsubst-
Variablenliste enthalten sein — ein Fehlen in nur einem Pfad reicht aus, damit der
Pocket-ID-Pod den literalen Platzhalter-String statt eines numerischen Werts erhält.

#### Scenario: Prod-Deploy substituiert SMTP_USER korrekt

- **GIVEN** `environments/mentolder.yaml` (oder `korczewski.yaml`) setzt `SMTP_USER`
- **WHEN** `task workspace:deploy ENV=mentolder` (oder `ENV=korczewski`) läuft
- **THEN** enthält das gerenderte Pocket-ID-Deployment-Manifest den echten `SMTP_USER`-Wert
  aus der Env-Datei, nicht den literalen String `"${SMTP_USER}"`

#### Scenario: Prod-Deploy substituiert SMTP_PORT korrekt

- **GIVEN** `environments/mentolder.yaml` (oder `korczewski.yaml`) setzt `SMTP_PORT` (z. B.
  `"587"`)
- **WHEN** `task workspace:deploy ENV=mentolder` (oder `ENV=korczewski`) läuft
- **THEN** enthält das gerenderte Pocket-ID-Deployment-Manifest den echten numerischen
  `SMTP_PORT`-Wert, nicht den literalen String `"${SMTP_PORT}"`

#### Scenario: Partial-Deploy spiegelt denselben SMTP-Contract

- **GIVEN** `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=pocket-id` läuft
- **WHEN** das Pocket-ID-Manifest gerendert wird
- **THEN** sind `SMTP_USER`, `SMTP_PORT` und `POCKET_ID_SMTP_TLS` identisch zu dem, was
  `task workspace:deploy ENV=mentolder` für denselben Service rendern würde

#### Scenario: TLS-Modus wird korrekt aus SMTP_SECURE + SMTP_PORT hergeleitet

- **GIVEN** eine Env-Datei mit `SMTP_SECURE: "false"` und `SMTP_PORT: "587"` (z. B. mentolder,
  korczewski gegen `smtp.mailbox.org`)
- **WHEN** ein Deploy-Task für diese Env läuft
- **THEN** wird der Pocket-ID-Container-Env `SMTP_TLS=starttls` gesetzt

- **GIVEN** eine Env-Datei mit `SMTP_PORT: "1025"` (Dev, Mailpit) und `SMTP_SECURE: "false"`
- **WHEN** `task workspace:deploy ENV=dev` läuft
- **THEN** wird der Pocket-ID-Container-Env `SMTP_TLS=none` gesetzt
