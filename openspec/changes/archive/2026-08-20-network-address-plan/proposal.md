# Proposal: network-address-plan

## Why

Die IP-Bereiche des Projekts sind an keiner Stelle vollständig deklariert. Sie stehen verstreut
in Szenarien einzelner Specs (`fleet-operations.md`, `terminal-sidekick.md`, `rustdesk-server.md`,
`workspace-deploy.md`, `sdlc-isolation.md`), in `wireguard/wg-mesh-nodes.yaml`, in Manifesten und
in Skripten — 246 Fundstellen gegen Repo-Stand `b5d0fef87`. Weil niemand den Plan als Ganzes
sieht, fallen Überschneidungen erst als Betriebsstörung auf, und zwar als die schlechteste Sorte:
Pakete verschwinden lautlos, statt dass etwas einen Fehler meldet.

Fünf Überschneidungen und ein Deklarations-Widerspruch sind belegt (Messbefehle im Ticket
T012645):

- **K1** Das Heim-LAN liegt auf `10.0.0.0/8` und umfasst damit das fleet-Mesh `10.20.0.0/24`,
  die Pod-CIDRs `10.42.0.0/16`, das Service-Netz `10.43.0.0/16` und das korczewski-Mesh
  `10.13.14.0/24`. Auf dem WSL-Host retten nur Longest-Prefix-Routen für `10.42.3/5/6`; für die
  Pod-CIDRs der drei Control-Plane-Knoten (`10.42.0/1/2`) fehlen sie, deren Verkehr läuft in
  das LAN. Dieselbe Fehlerklasse wie T002491.
- **K2** `192.168.100.0/24` ist doppelt vergeben: als mentolder-WG-Mesh (`.33/.34/.35` für
  pk-hetzner-4/6/8) und als Hetzner-Privatnetz derselben Server (`.5/.6/.8`).
- **K3** `192.168.100.10` liegt auf dem WSL-Host zweimal — auf `wg0` (WSL) und auf `eth3`
  (der in WSL gespiegelte Windows-Tunnel `wg-gpu`).
- **K4** Das korczewski-Mesh `10.13.14.0/24` ist deklariert, der zugehörige Cluster ist abgebaut.
- **K7** `k3d-mentolder-dev` benutzt dieselben Pod-CIDRs `10.42.0.0/24`, `10.42.1.0/24` und
  dasselbe Service-Netz wie `fleet`. Deshalb lassen sich die in K1 fehlenden Routen auf diesem
  Host nicht einfach nachtragen — sie kollidierten mit dem lokalen Cluster.
- **K8** Dieselbe Größe wird widersprüchlich deklariert: `rustdesk-server.md` nennt das
  fleet-Overlay `10.20.0.0/16`, `terminal-sidekick.md` und `workspace-deploy.md` `10.20.0.0/24`.

## What

Eine SSOT-Registry `docs/agent-guide/registry/networks.yaml` deklariert **jeden** Adressbereich
mit Eigentümer, Zweck, Status und — wo eine Überschneidung besteht — der Überschneidung selbst
samt ihrer Absicherung. Ein fail-closed Guard prüft bei jedem Testlauf, dass sich keine zwei
Bereiche überschneiden, **außer** die Überschneidung ist in der Registry ausdrücklich erklärt.
Eine generierte Karte `docs/agent-guide/maps/networks-map.md` macht den Plan lesbar.

Damit ist „einzigartig" nicht mehr eine Eigenschaft, die jemand beim Lesen prüfen müsste,
sondern eine, die der Testlauf hält.

**Non-Goals.** Kein laufendes Netz wird umnummeriert (Operator-Entscheidung 2026-08-19): weder
das mentolder-Mesh weg vom Hetzner-Privatnetz, noch das Heim-LAN weg von `10.0.0.0/8`. K1, K2,
K3 und K7 werden als erklärte Überschneidung mit dokumentierter Absicherung festgehalten, nicht
aufgelöst. Der Non-Root-Fix des GitLab-Runners läuft getrennt unter T012644 (gemergt als #4814).

_Ticket: T012645_
