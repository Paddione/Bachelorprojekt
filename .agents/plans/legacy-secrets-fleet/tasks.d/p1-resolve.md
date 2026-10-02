# p1 — Aufloesung ueber secrets_env

Target files: `scripts/lib/secrets-env.sh`, `scripts/env-seal.sh`, `scripts/secret-rotate.sh`,
`scripts/claude-key-picker.sh`, `taskfiles/Taskfile.platform.yml`, `taskfiles/Taskfile.workspace.yml`,
`taskfiles/Taskfile.web.yml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`.

### Task 1: Helper

`scripts/lib/secrets-env.sh` mit `secrets_env_for <env> [env_dir=environments]`: liest das
Top-Level-Feld `secrets_env` aus `<env_dir>/<env>.yaml` (python3/yaml), gibt es aus, sonst `<env>`.
Fehlt das Env-File, ebenfalls `<env>` (env-seal meldet den Fehler selbst).

### Task 2: Env-Files

`secrets_env: fleet-mentolder` in `environments/mentolder.yaml`, `secrets_env: fleet-korczewski` in
`environments/korczewski.yaml`, direkt unter `context:`, mit Kommentar-Verweis auf T900789.

### Task 3: Aufrufstellen

`SECRETS_ENV=$(secrets_env_for ...)` und Pfade mit `${SECRETS_ENV}` in `env-seal.sh` (Secrets,
Output, Cert), `secret-rotate.sh`, `Taskfile.platform.yml` `secrets:sync`,
`Taskfile.workspace.yml` (GHCR-Token, `workspace:deploy`), `Taskfile.web.yml` (GHCR-Token).
`claude-key-picker.sh` liest `fleet-mentolder.yaml`.
