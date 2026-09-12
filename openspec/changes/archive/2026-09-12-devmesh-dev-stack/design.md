# Design: devmesh-dev-stack

## Goals

- Der lokale Stack läuft auf devmesh, aus der Arbeitskopie deploybar, vor dem Merge testbar.
- Zu Hause und unterwegs unter denselben Hostnamen mit gültigem Zertifikat erreichbar.
- Keine zweite „lebende" Ticket-DB: devmesh-Daten sind Entwicklungsdaten.
- Die Daten des heutigen k3d-Stacks gehen beim Umzug nicht verloren.

## Non-Goals

- devmesh als führende SDLC-Oberfläche (bleibt fleet `workspace-dev`).
- GitOps für devmesh.
- Hochverfügbarkeit der Datenbank.

## Kontext (gemessen 2026-09-11)

```bash
kubectl --context k3d-mentolder-dev get deploy,sts -A --no-headers
# workspace: bge-embed, bge-rerank, pocket-id, sdlc-console, shared-db (je 1/1)
kubectl --context k3d-mentolder-dev -n workspace exec deploy/shared-db -- \
  psql -U postgres -tAc "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate"
# website 127 MB, pocket_id 11 MB, uebrige ~7 MB
kubectl --context fleet -n workspace exec deploy/shared-db -c postgres -- \
  psql -U postgres -d website -tAc "select count(*), max(external_id) from tickets.tickets"
# 388 | T900115  -> fleet ist fuehrend
```

## Decisions

### D1 — Zwei Profile statt Feature-Flags

Kustomize-Components lassen sich nicht per Umgebungsvariable ein- und ausschalten, ohne die
`kustomization.yaml` zu generieren. Zwei feste Overlays (`core`, `full`) sind lesbar,
validierbar (`kustomize build`) und im CI prüfbar. `full` braucht mehr RAM als die 48 GB vor
dem Beitritt von `ws-ubuntu-1`; deshalb ist `core` der Default bis SP-5.

### D2 — `environments/dev.yaml` wird umgezogen, nicht dupliziert

`dev.yaml` beschreibt laut Kopfkommentar „NUR die lokale k3d-Umgebung". Das bleibt semantisch
richtig: es ist die lokale Umgebung, nur auf einem anderen Cluster. Ein zusätzliches
`devmesh.yaml` würde zwei lokale Profile erzeugen und `ENV=dev`-Defaults im Taskfile auf den
toten Context zeigen lassen. `environments/dev-cluster.yaml` (fleet `workspace-dev`) bleibt
unverändert.

### D3 — Öffentliche DNS-Records auf Tailnet-Adressen

Records auf `100.x`-Adressen sind öffentlich auflösbar, aber nur für Tailnet-Mitglieder
erreichbar. Vorteil: ein echtes Let's-Encrypt-Wildcard ohne eigene CA auf Windows, Android
und Browsern. Nachteil: die Hostnamen und Tailnet-Adressen sind öffentlich sichtbar; sie
geben keinen Zugang preis. Drei A-Records verteilen auf die drei Server; fällt einer aus,
versucht der Client den nächsten.

### D4 — Eigene Pocket ID mit fleet-Fallback

Die migrierte `pocket_id`-DB behält Passkeys und Clients. Die bestehende Anforderung
„fail-closed fallback" bleibt; der Fallback-Weg zur fleet-Pocket-ID läuft über deren
öffentlichen Host statt über das `wg-gpu`-Mesh, weil devmesh-Knoten nicht im `wg-gpu`-Mesh sind.

### D5 — Ticket-Guard an den drei Context-Auflösern

`ticket.sh`, `_ticket-core.sh` und `factory/lib.sh` lösen den Context an drei Stellen auf
(Kommentar T003544 verlangt, sie gemeinsam zu ändern). Der Guard prüft den aufgelösten
Context-Namen **und** den API-Server der Kubeconfig, damit ein umbenannter Context den Guard
nicht umgeht (Lehre aus `kubeconfig-drift-guard.bats`). Lesezugriffe bleiben erlaubt, damit
UI-Entwicklung gegen die Dev-Daten debugbar bleibt.

### D6 — Migration mit Zeilenzahl-Vergleich

`pg_dump`/`pg_restore` pro Datenbank, danach `count(*)` pro Tabelle in Quelle und Ziel. Eine
Abweichung beendet `task devmesh:migrate` mit Exit 1; die Quelle bleibt unangetastet, bis SP-5
den Abbau erst nach bestandenem Vergleich erlaubt.

### D7 — GPU über EndpointSlice auf die Tailnet-Adresse

Die LAN-Adresse von PK-Desktop kommt per DHCP; die Tailnet-Adresse ist stabil. Pods erreichen
`100.x` über den Tailscale-Dienst ihres Knotens (Egress wird vom Knoten übernommen). Der Port
steht als `gpu_endpoint` im Inventar, damit Manifeste keine Adresse hart kodieren.

## Risks

- **R1** RAM: `core` muss in 48 GB passen. Die Resource-Requests werden gegen
  `kubectl describe nodes` gemessen, nicht geschätzt.
- **R2** Offene Altänderungen an `sdlc-isolation` (`wsl-exit-nachzug`, `wsl-exit-adr007`,
  `wsl-exit-sdlc-console-fleet`, Tickets `done`, Changes nicht archiviert). Vor der
  Archivierung dieses Changes muss mindestens `wsl-exit-nachzug` archiviert sein.
- **R3** Pod-Egress auf Tailnet-Adressen hängt am Tailscale-Dienst des Knotens; fällt er aus,
  greift die Degradierung aus D7.
- **R4** Öffentlich sichtbare Hostnamen (D3).

## Testing

- CI: `kustomize build dev-local/core` und `dev-local/full` im bestehenden
  Manifest-Struktur-Check.
- BATS `tests/spec/local-dev-mesh/ticket-devmesh-guard.bats`: Schreibbefehl mit
  `TICKET_CTX=devmesh` → Exit ≠ 0, Meldung nennt `fleet`; Lesebefehl bleibt erlaubt;
  umbenannter Context mit devmesh-Server wird ebenfalls abgewiesen.
- BATS `tests/spec/local-dev-mesh/migrate-from-k3d.bats` mit gestubbtem `kubectl`:
  abweichende Zeilenzahl → Exit 1, Quelle unverändert.
- Live-Abnahme: `task devmesh:status` grün; `curl -sf https://web.devmesh.mentolder.de/api/health`
  von PK-L-1 außerhalb des Heimnetzes liefert 200 und `sdlc`-Build-Target der Console.
