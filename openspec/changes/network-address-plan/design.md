---
ticket_id: T012645
plan_ref: openspec/changes/network-address-plan/tasks.md
status: active
date: 2026-08-19
domains: [website, infra, test, security]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Netzwerk-Adressplan als SSOT mit fail-closed Overlap-Guard

## Zweck

Jeder IP-Bereich des Projekts wird an genau einer Stelle deklariert, dokumentiert und maschinell
gegen Überschneidung geprüft. Der Plan wird damit von einer Eigenschaft, die man beim Lesen
nachvollziehen müsste, zu einer, die der Testlauf hält.

## Ausgangslage (erhoben 2026-08-19)

Gemessen gegen Repo-Stand `b5d0fef87` und den lebenden `fleet`-Cluster. Die Messbefehle stehen
im Ticket T012645; hier stehen die Ergebnisse.

| Bereich | Eigentümer | Quelle der Wahrheit heute |
|---|---|---|
| `10.0.0.0/8` | Heim-LAN (FritzBox `10.0.0.1`) | nirgends im Repo deklariert |
| `10.13.14.0/24` | korczewski-WG-Mesh (Cluster abgebaut) | `wireguard/wg-mesh-nodes.yaml` |
| `10.20.0.0/24` | fleet-WG-Overlay = `InternalIP` der Knoten | Registry + 4 Specs, eine davon widersprüchlich |
| `10.42.0.0/16` | Pod-CIDRs (fleet **und** k3d-dev) | `.spec.podCIDR` der Knoten |
| `10.43.0.0/16` | Service-CIDR (fleet **und** k3d-dev) | k3s-Default, nirgends deklariert |
| `100.64.0.0/10` | Tailscale (`pk-desktop`, `pk-hetzner-8`) | nirgends im Repo deklariert |
| `172.17.0.0/16`, `172.18.0.0/16`, `172.23.0.0/16` | Docker-Bridges | nirgends deklariert |
| `192.168.100.0/24` | mentolder-WG-Mesh | `wireguard/wg-mesh-nodes.yaml` |
| `192.168.100.0/24` | Hetzner-Privatnetz derselben Server | nur die Hetzner-Konsole |

Die letzte Zeile ist der Kern des Problems: ein Bereich, den das Repo als eigenen führt, gehört
gleichzeitig einem Netz, das das Repo überhaupt nicht kennt.

## Entscheidungen

### E1 — Deklarieren und absichern, nicht umnummerieren

Operator-Entscheidung vom 2026-08-19. Umnummerieren würde bedeuten: das mentolder-Mesh auf einen
freien Bereich ziehen (Registry, Sealed Secrets, Windows-Tunnel, beide Laptops, drei Hetzner-Nodes)
oder das Heim-LAN von `/8` auf ein enges Präfix (jedes Gerät im Haushalt). Beides sind eigene
Wartungsvorgänge mit eigenem Risiko und setzen Zugriff voraus, der derzeit nicht besteht.

Verworfen wurde damit auch die naheliegende Zwischenstufe „nur das tote korczewski-Mesh
entfernen": ein gelöschter Eintrag ist kein Schutz. Wer den Bereich später neu vergibt, findet
nichts vor, was ihn warnt. Er bleibt deklariert, mit `status: retired`.

### E2 — SSOT ist eine eigene Registry-Datei

`docs/agent-guide/registry/networks.yaml`, neben `mcp.yaml`, `capabilities.yaml`, `agents.yaml`.
Geprüft: `scripts/agent-guide/load.mjs` liest **benannte** Dateien (`${name}.yaml`), nicht per
Glob — eine zusätzliche Datei im Verzeichnis lässt die bestehende agent-guide-Pipeline
unberührt. Verworfen: die Bereiche in `wireguard/wg-mesh-nodes.yaml` zu ergänzen. Diese Datei
beschreibt WireGuard-Peers; Pod-CIDRs, Service-Netze, Docker-Bridges und das Heim-LAN haben mit
WireGuard nichts zu tun und hätten dort kein Zuhause.

### E3 — Erklärte Überschneidung ist der Kern, nicht der Sonderfall

Ein Guard, der jede Überschneidung verbietet, wäre am Tag seiner Einführung rot — K1, K2, K3 und
K7 bestehen ja. Ein roter Guard, den niemand grün bekommen kann, wird abgeschaltet; dann ist die
Lage schlechter als vorher, weil jetzt zusätzlich eine abgeschaltete Prüfung im Repo steht.

Deshalb unterscheidet der Guard zwei Fälle:

- **Nicht erklärte Überschneidung** → Fehler. Das ist der Fall, den wir künftig verhindern wollen.
- **Erklärte Überschneidung** → grün. Der Eintrag trägt `overlaps:` mit Gegenpartei, Grund und
  Absicherung. Die Überschneidung ist damit nicht weg, aber sie ist eine bewusste, nachlesbare
  Entscheidung statt eines Zufalls.

Die Gegenprobe gehört dazu: Ein `overlaps:`-Eintrag, dessen Gegenpartei gar nicht überschneidet,
ist ebenfalls ein Fehler. Sonst verkommt das Feld zur Blanko-Ausnahme, die jemand vorsorglich
setzt und die dann eine echte, neue Kollision verdeckt.

### E4 — Der Guard rechnet, er greppt nicht

Überschneidung wird über Integer-Vergleich der Netz-Grenzen entschieden, nicht über
Zeichenketten. `10.0.0.0/8` und `10.42.5.0/24` haben kein gemeinsames Textpräfix, das ein
`grep` fände, überschneiden sich aber vollständig — genau diese Klasse ist der teure Teil von K1.

### E5 — Widersprüche werden am SSOT-Spec aufgelöst, nicht danebengeschrieben

K8 (`10.20.0.0/16` vs. `/24`) wird in `openspec/specs/rustdesk-server.md` als `MODIFIED`-Delta
korrigiert, mit dem lebenden Cluster als Beleg: die Knoten tragen `10.20.0.1` bis `10.20.0.6`,
das Overlay ist ein `/24`. Ein `/16` an dieser Stelle würde in einer NetworkPolicy 255-mal mehr
freigeben als beabsichtigt.

## Komponenten

### K1 — `docs/agent-guide/registry/networks.yaml`

Eine Liste von Einträgen. Je Eintrag: `id`, `cidr`, `owner`, `purpose`, `status`
(`active` | `retired`), `source` (wo der Bereich tatsächlich konfiguriert ist) und optional
`overlaps:` (Liste aus `with`, `reason`, `mitigation`).

### K2 — `scripts/networks-check.mjs`

Fail-closed. Lädt die Registry, prüft: jedes `cidr` ist syntaktisch gültig und normalisiert
(Netzadresse passt zur Präfixlänge), jede `id` ist eindeutig, jedes Paar wird auf Überschneidung
geprüft, und jeder `overlaps:`-Eintrag wird gegen die tatsächliche Rechnung gehalten (beide
Richtungen: unerklärte Überschneidung → Fehler, erklärte Nicht-Überschneidung → Fehler).

### K3 — `docs/agent-guide/maps/networks-map.md` (generiert)

Nach dem Muster der bestehenden Karten, erzeugt aus der Registry. Nicht von Hand editieren;
der Freshness-Guard fängt Drift.

### K4 — Guard-Test `tests/spec/network-address-plan/networks-registry.bats`

Prüft Ausgabe und Exit-Code von `scripts/networks-check.mjs` — gegen Fixtures mit
bekannt-guter und bekannt-schlechter Registry, plus einen Positiv-Anker gegen die echte
Registry. Nicht die Quelle des Skripts.

## Risiken

- **Die Registry ist eine Behauptung über die Welt, kein Abbild.** Sie kann von der Realität
  abdriften — ein neuer Docker-Bridge-Bereich, ein Node mit neuem Pod-CIDR. Der Guard prüft
  Widerspruchsfreiheit *innerhalb* der Registry, nicht Übereinstimmung mit dem laufenden System.
  Ein Abgleich gegen den lebenden Cluster wäre ein eigener Vorgang und bräuchte Cluster-Zugriff
  im CI, den es nicht gibt.
- **`overlaps:` kann missbraucht werden.** Die Gegenprobe aus E3 begrenzt das, hebt es nicht auf.
  Wer eine echte Kollision wegdeklarieren will, kann es — dann steht es allerdings mit Grund und
  Absicherung im Repo und fällt im Review auf.

## Referenzen

- Ticket T012645 (Messbefehle und Belege), T002491 (Pod-CIDRs in AllowedIPs, gleiche Fehlerklasse)
- `wireguard/wg-mesh-nodes.yaml`, `scripts/agent-guide/load.mjs`
- `openspec/specs/rustdesk-server.md`, `openspec/specs/terminal-sidekick.md`,
  `openspec/specs/workspace-deploy.md`, `openspec/specs/fleet-operations.md`
