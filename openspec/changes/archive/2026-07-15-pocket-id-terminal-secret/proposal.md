# Proposal: pocket-id-terminal-secret

## Why

Der `oauth2-proxy-terminal` Pod schlägt mit `CreateContainerConfigError` fehl, weil der
Key `POCKET_ID_TERMINAL_SECRET` im Kubernetes Secret `workspace-secrets` fehlt. Der Pod
referenziert diesen Key als `secretKeyRef` (k3d/oauth2-proxy-terminal.yaml:93), aber er
wurde nie in die Secret-Definition aufgenommen. Der aktive Pocket-ID-Seed-Job
(`pocket-id-client-seed.yaml`) handhabt den Terminal-Client korrekt inklusive Writeback,
aber `env:seal` kann den Key nicht generieren/sealen, weil `environments/schema.yaml`
keinen Eintrag für `POCKET_ID_TERMINAL_SECRET` enthält. Für Dev fehlt zudem der
Platzhalter in `k3d/secrets.yaml`.

## What

Füge `POCKET_ID_TERMINAL_SECRET` an allen drei Stellen hinzu:
1. `environments/schema.yaml` — Schema-Eintrag (required: false, generate: true, length: 40)
2. `k3d/secrets.yaml` — Dev-Platzhalter
3. `k3d/seed.yaml` + `k3d/clean-seed.yaml` — Legacy-Seed-Jobs aktualisieren (optional, für Konsistenz)

_Ticket: T001801_
