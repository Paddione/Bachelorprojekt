# Proposal: devmesh-k3d-decommission

## Why

Nach SP-3 trägt devmesh den lokalen Stack. `k3d-mentolder-dev` auf `ws-ubuntu-1` ist dann
doppelt vorhanden und bindet einen Host mit 4 Kernen und 16 GB. Gleichzeitig verweisen rund
40 aktive Dateien auf den k3d-Context — darunter der Default `FACTORY_CTX=k3d-mentolder-dev`
in `scripts/factory/lib.sh`, der Factory-Skripte ohne gesetzte Variable gegen die veraltete
lokale DB laufen lässt, während `scripts/ticket.sh` schon auf `fleet` zeigt. CLAUDE.md und der
ops-Agent beschreiben „fleet ist der einzige Context", was seit SP-2 nicht mehr stimmt.

_Ticket: T900145_ · Programm: T900115 (ADR-008) · prerequisites: SP-1 through SP-4

## What Changes

1. **Abnahme-Gate `task devmesh:acceptance`:** Health-Gate von devmesh grün, Migrationsvergleich
   aus SP-3 bestanden, frischer Dump beider k3d-Datenbanken nach
   `~/backups/k3d-mentolder-dev-<datum>/` (30 Tage aufbewahren). Erst danach ist der Abbau erlaubt.
2. **Abbau:** `k3d cluster delete mentolder-dev` auf `ws-ubuntu-1`, Context
   `k3d-mentolder-dev` aus den Kubeconfigs der Dev-Clients entfernt.
3. **Beitritt `ws-ubuntu-1`** als Agent über `scripts/devmesh/k3s-install.sh` (Preflight aus
   SP-2), Tailnet-Tag `tag:devmesh` (SP-1), Inventar-Eintrag; `DEVMESH_PROFILE` Default wird `full`.
4. **Context-Defaults:** `FACTORY_CTX` in `scripts/factory/lib.sh` → `fleet` (gleich
   `ticket.sh`); weitere Defaults in `scripts/factory/sandbox-run.sh`, `scripts/session-hub.sh`,
   `scripts/runtime-drift-check.sh`, `scripts/lib/llm-stack-measure.sh`,
   `scripts/sdlc-sync-oidc-secret.sh`.
5. **SDLC-Tasks:** `sdlc:cluster:create|delete|status` und `sdlc:cert:check` entfallen;
   `sdlc:up`/`sdlc:down` arbeiten gegen devmesh ohne Cluster-Lebenszyklus;
   `scripts/sdlc/kubelet-cert-check.sh` und `k3d/sdlc-stack/k3d-config.yaml` gelöscht;
   `taskfiles/Taskfile.devcluster.yml` gelöscht.
6. **Tests:** `tests/spec/sdlc-isolation/{e2-local-stack,sdlc-up-command,kubelet-cert-guard,llm-up-health,e3-tickets-lokal}.bats`,
   `tests/spec/db-guard/kubeconfig-drift-guard.bats`, `tests/lib/factory-test-fixtures.sh` und die
   Factory-BATS auf devmesh/fleet umgestellt oder mit ihrem Requirement gelöscht.
7. **Guard `tests/spec/local-dev-mesh/no-k3d-context.bats`:** kein aktiver Verweis auf
   `k3d-mentolder-dev` mehr (Suchbefehl im Design).
8. **Doku:** CLAUDE.md-Abschnitt „Cluster Topology & Nodes", `.claude/agents/bachelorprojekt-ops.md`,
   `docs/superpowers/references/gotchas-footguns.md`, `docs/sdlc-stack/README.md`,
   `scripts/dev-host-units/README.md`: zwei Contexts — `fleet` (Prod) und `devmesh` (Dev).
9. **`sdlc-isolation`:** k3d-Requirements umbenannt, umgeschrieben oder entfernt.

## Non-Goals

- Umbenennen des Verzeichnisses `k3d/` (ist Kustomize-Basis, kein k3d-Werkzeug).
- Archivierte Changes, Pläne und ADR-Historie bleiben unverändert.
- Der historische Befund im Szenario „Local k3d dev DB lacks questionnaire_test_status"
  (`e2e-test-infrastructure`) bleibt als Messaussage stehen.

## Voraussetzungen

- `wsl-exit-nachzug` ist archiviert (entfernt „Dev-Host WSL memory verified" bereits).
- SP-3 abgenommen.

## Impact

- Specs: `local-dev-mesh` (ADDED), `sdlc-isolation` (RENAMED/MODIFIED/REMOVED)
- Dateien: siehe What Changes 4–8
- Operator-Schritt: Abbau auf `ws-ubuntu-1` (SSH-Zugang nötig).
