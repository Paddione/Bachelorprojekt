# Proposal: devmesh-dev-stack

## Why

Der lokale Entwicklungs-Stack läuft heute in `k3d-mentolder-dev` auf `ws-ubuntu-1` — einem
Einzelhost-Docker-Cluster, den CLAUDE.md und `wsl-exit-nachzug` für abgebaut halten
(gemessen 2026-09-11: `Ready`, 18 Tage alt, trägt `shared-db`, `pocket-id`, `sdlc-console`,
`bge-embed`, `bge-rerank`). ADR-008 verlegt diesen Stack auf den HA-Cluster `devmesh` (SP-2)
und erweitert ihn um die Workspace-Dienste. Die führende SDLC-Oberfläche und die führende
Ticket-DB bleiben auf fleet; devmesh ist eine Entwicklungsinstanz.

_Ticket: T900118_ · Programm: T900115 (ADR-008) · blocked_by: T900117 (SP-2) · Nachfolger: T900120 (SP-5)

## What Changes

1. **Overlays `dev-local/core` und `dev-local/full`** auf der `k3d/`-Basis. `core`: website
   (BUILD_TARGET unset), sdlc-console, shared-db, pocket-id + client-seed, bge-embed/-rerank
   (CPU), brett, mailpit. `full` = `core` + Kustomize-Components `dev-local/components/nextcloud`,
   `collabora`, `talk`, `vaultwarden`, `docuseal`. Namespace `workspace` wie im heutigen
   lokalen Stack. Dev-taugliche Resource-Requests per Patch.
2. **`environments/dev.yaml`:** `context: devmesh`, `domain: devmesh.mentolder.de`,
   `DEVMESH_PROFILE` (`core` bis SP-5, danach `full`). Kein neues Environment — `ENV=dev`
   zeigt ab jetzt auf devmesh.
3. **Einstieg `task devmesh:deploy`** (Namespace `devmesh:`, weil `dev:` dem Staging-Stack
   vorbehalten ist): rendert das Profil aus der Arbeitskopie, applied SealedSecrets, dann
   Manifeste, wartet auf Rollouts. `task devmesh:status` zeigt Deployments und Zertifikat.
4. **Hostnamen und TLS:** `*.devmesh.mentolder.de` als drei A-Records auf die Tailnet-Adressen
   der Server; cert-manager `ClusterIssuer` mit DNS01 über den vorhandenen ipv64-Webhook
   (Muster `k3d/dev-stack/cert-manager.yaml`), Wildcard-Zertifikat im Traefik-`TLSStore`.
5. **Secrets:** Sealed-Secrets-Controller auf devmesh, eigenes Zertifikat
   `environments/certs/devmesh.pem`, `environments/sealed-secrets/dev.yaml` aus
   `environments/.secrets/dev.yaml` (ipv64-Token, Pocket-ID-Secrets, GitHub-Token).
6. **Pocket ID lokal** mit Fallback auf die fleet-Pocket-ID (fail-closed, bestehende Anforderung).
7. **GPU-Anbindung:** Service `llm-gateway-host` ohne Selector plus `EndpointSlice` auf die
   Tailnet-Adresse von PK-Desktop und den Port aus `devmesh/inventory.yaml` (`gpu_endpoint`).
   Ist PK-Desktop aus, meldet die Console degradiert statt abzustürzen.
8. **Migration `task devmesh:migrate`:** `pg_dump` von `pocket_id` und `website` aus
   `k3d-mentolder-dev`, Restore nach devmesh, Vergleich der Zeilenzahlen pro Tabelle.
9. **Ticket-Tooling-Guard:** `scripts/ticket.sh`, `scripts/vda/ticket/_ticket-core.sh`,
   `scripts/factory/lib.sh` und `scripts/ticket-mcp-node` verweigern Schreibzugriffe, wenn der
   aufgelöste Context `devmesh` ist, und nennen `fleet` als führende DB.
10. **Backup:** CronJob `shared-db-backup` auf devmesh, täglicher `pg_dumpall` auf das
    `storage=true`-Volume, 14 Tage Aufbewahrung.

## Non-Goals

- Factory-Runner auf devmesh (ADR-008 D5 bleibt optional, nicht Teil dieses Changes).
- Flux auf devmesh.
- Änderungen an fleet `workspace-dev` oder den Brand-Namespaces.
- Abbau von `k3d-mentolder-dev` und Umstellung der übrigen k3d-Verweise (SP-5).

## Voraussetzungen

- `wsl-exit-nachzug` (T900054, done) ist archiviert, bevor dieser Change archiviert wird —
  beide ändern `sdlc-isolation`.
- SP-1 (Tailnet) und SP-2 (Cluster) sind abgenommen.

## Impact

- Specs: `local-dev-mesh` (ADDED), `sdlc-isolation` (MODIFIED/RENAMED), `nextcloud-integration` (MODIFIED)
- Dateien: `dev-local/`, `environments/dev.yaml`, `environments/schema.yaml`,
  `environments/sealed-secrets/dev.yaml`, `environments/certs/devmesh.pem`,
  `taskfiles/Taskfile.devmesh.yml`, `scripts/devmesh/migrate-from-k3d.sh`,
  `scripts/ticket.sh`, `scripts/vda/ticket/_ticket-core.sh`, `scripts/factory/lib.sh`,
  `scripts/ticket-mcp-node/`, `devmesh/inventory.yaml`, `tests/spec/local-dev-mesh/`
- Operator-Schritte: DNS-Records bei ipv64, Tailscale-Adressen ins Inventar.
