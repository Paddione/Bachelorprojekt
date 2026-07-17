---
title: "pocket-id-terminal-secret — Implementation Plan"
ticket_id: T001801
domains: [security, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-terminal-secret — Implementation Plan

## Tasks

### Task 1: Schema-Eintrag hinzufügen
- Datei: `environments/schema.yaml`
- Füge `POCKET_ID_TERMINAL_SECRET` nach `POCKET_ID_SESSION_HUB_SECRET` (Zeile 882) ein
- Pattern wie `POCKET_ID_BRAINSTORM_SECRET` (Zeile 872): required: false, generate: true, length: 40
- Description: "OIDC client secret for the `terminal-sidekick` Pocket ID client (terminal oauth2-proxy)."

### Task 2: Dev-Platzhalter hinzufügen
- Datei: `k3d/secrets.yaml`
- Füge `POCKET_ID_TERMINAL_SECRET: "devterminalpocketidsecret12"` nach `POCKET_ID_NEXTCLOUD_SECRET` (Zeile 96) ein

### Task 3: Legacy-Seed-Jobs aktualisieren (optional)
- Datei: `k3d/seed.yaml`
  - Env-Var: `SECRET_terminal` mit `secretKeyRef: POCKET_ID_TERMINAL_SECRET` (nach Zeile 148, brain)
  - ROWS: `terminal-sidekick|SECRET_terminal|POCKET_ID_TERMINAL_SECRET|${SCHEME}://terminal.${SUFFIX}/oauth2/callback`
- Datei: `k3d/clean-seed.yaml` — gleiche Änderungen

### Task 4: Validierung
- `task workspace:validate` — Kustomize Dry-Run
- Prüfe ob `env:seal` den neuen Key erkennt: `bash scripts/env-resolve.sh` ( sourced )
