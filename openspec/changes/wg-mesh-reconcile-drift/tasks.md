---
title: "wg-mesh-reconcile-drift — Implementation Plan"
ticket_id: T900083
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wg-mesh-reconcile-drift — Implementation Plan

_Ticket: T900083_

## File Structure

```
wireguard/wg-mesh-nodes.yaml                        (M) interface:-Key je Umgebung
scripts/hetzner/generate-wg-conf.sh                 (M) --peers-only Modus
scripts/wg-mesh-sync.sh                             (A) reconcile + drift
Taskfile.yml                                        (M) wg:reconcile, wg:drift
tests/spec/fleet-operations/wg-mesh-sync.bats       (A) Guards
```

## Design

Ein Renderer, zwei Konsumenten. `generate-wg-conf.sh` bleibt die einzige Stelle, die die Registry
in eine Peer-Menge übersetzt; sie bekommt dafür einen `--peers-only`-Modus, der statt einer
vollständigen Config nur die Soll-Peers eines Nodes ausgibt — je Zeile `<public_key> <allowed_ips>`,
sortiert, ohne `[Interface]`-Block. `scripts/wg-mesh-sync.sh` ruft diesen Modus auf und ist damit
per Konstruktion nicht in der Lage, eine andere Soll-Menge zu berechnen als der Reconcile herstellt.

Der Interface-Name kommt aus einem neuen `interface:`-Key je Umgebungsblock der Registry. Verifiziert
am Live-Zustand: `fleet` → `wg-fleet`, `mentolder` → `wg-gpu`. Für `korczewski` ist der Name nicht
verifiziert; der Block bekommt den Key erst, wenn er an einem laufenden Node abgelesen wurde — bis
dahin lehnt `wg-mesh-sync.sh` die Umgebung mit klarer Meldung ab, statt einen Namen zu raten.

## Tasks

### 1. Guards schreiben (RED)

Neue Datei `tests/spec/fleet-operations/wg-mesh-sync.bats`. Geprüft wird der **Output** der
Kommandos, nicht deren Quelltext. Positiv-Anker zuerst (das Skript läuft und findet die Umgebung),
danach die Einzelaussagen.

Abzudeckende Aussagen:
- `generate-wg-conf.sh --env fleet --node-name pk-hetzner-4 --peers-only` gibt genau die sieben
  übrigen fleet-Teilnehmer aus, je Zeile ein Public Key, und **nicht** `pk-hetzner-4` selbst.
- Die Ausgabe enthält keinen `[Interface]`-Block und keinen `PrivateKey`.
- `wg-mesh-sync.sh drift --env fleet` ohne erreichbare Nodes endet mit Exit 0 und meldet den Skip.
- `wg-mesh-sync.sh reconcile --env korczewski` endet mit Exit != 0 und nennt den fehlenden
  `interface:`-Key, statt einen Namen zu raten.
- `wg-mesh-sync.sh reconcile --env fleet --dry-run` gibt eine Änderungsliste aus und enthält kein
  `wg set`/`wg syncconf` in der Wirkung — geprüft über einen `WG_MESH_SYNC_SSH` Stub, der jeden
  Remote-Aufruf protokolliert statt ihn auszuführen.

Verfügbarkeits-Guard in die Rotphase: das Skript braucht `python3` und `yaml`. Vorher prüfen, ob CI
das stellt (`grep -rn 'python3' .github/workflows/`); ohne Treffer gehört
`command -v python3 >/dev/null 2>&1 || skip "python3 not installed"` in jeden Test.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/wg-mesh-sync.bats
# expected: FAIL (rot — weder --peers-only noch wg-mesh-sync.sh existieren)
```

### 2. Registry um `interface:` erweitern

In `wireguard/wg-mesh-nodes.yaml` je Umgebungsblock einen `interface:`-Key neben `wg_subnet` und
`listen_port` ergänzen: `fleet: interface: "wg-fleet"`, `mentolder: interface: "wg-gpu"`. Der
`korczewski`-Block bleibt bewusst ohne den Key, mit Kommentar, warum (nicht am laufenden Node
verifiziert). Bestehende Tests (`wg-mesh-fullmesh.bats`, `wg-mesh-laptop-nodes.bats`) müssen grün
bleiben.

### 3. `--peers-only` in `generate-wg-conf.sh`

Neuer Modus, der die vorhandene `MESH_CATEGORIES`-Schleife wiederverwendet und statt der
Config-Zeilen `<public_key> <allowed_ips>` je Peer ausgibt, nach Public Key sortiert. `--private-key`
wird in diesem Modus nicht verlangt. Peers ohne `public_key` (heute `terminal-sidekick`) werden
übersprungen und auf stderr genannt — sie erzeugen sonst eine leere Schlüsselzeile, die weder
importierbar noch vergleichbar ist.

### 4. `scripts/wg-mesh-sync.sh` — reconcile

Subkommando `reconcile --env <env> [--dry-run] [--node <name>]`. Pro Node der Umgebung:
Soll-Menge über `generate-wg-conf.sh --peers-only` holen, Ist-Menge über
`wg show <iface> peers` lesen, Differenz bilden. Fehlende Peers per `wg set` ergänzen und in
`/etc/wireguard/<iface>.conf` schreiben; überzählige Peers nur mit explizitem `--prune` entfernen,
damit ein unvollständiger Registry-Stand keinen laufenden Tunnel abräumt. Vor jeder Änderung eine
Sicherung der `.conf` anlegen. `--dry-run` gibt die Differenz aus und ändert nichts.

Der SSH-Aufruf geht über eine Variable (`WG_MESH_SYNC_SSH`, Default `ssh`), damit die Tests ihn
stubben können.

### 5. `scripts/wg-mesh-sync.sh` — drift

Subkommando `drift --env <env>`. Pro Node Ist- und Soll-Menge vergleichen; bei Abweichung Exit != 0
mit namentlicher Nennung der betroffenen Nodes **und** der fehlenden bzw. überzähligen Peers. Sind
die Nodes nicht erreichbar, Exit 0 mit Skip-Meldung — dasselbe Verhalten wie
`scripts/fleet-membership-check.sh`, damit das Gate ohne Cluster-Zugang nicht falsch rot wird.

### 6. Taskfile-Einträge

`wg:reconcile` und `wg:drift` in `Taskfile.yml` neben `fleet:membership` einhängen, mit `desc`, die
Usage und Exit-Code-Semantik nennt — dem Stil der bestehenden `fleet:*`-Tasks folgend.

### 7. Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich am lebenden Cluster gegenprüfen, dass der Drift-Check die heute bekannte Asymmetrie
findet, bevor der Reconcile sie behebt:

```bash
task wg:drift ENV=fleet
# erwartet: Exit != 0, nennt wsl2-gpu-fleet und terminal-sidekick als auf fuenf Nodes fehlend
task wg:reconcile ENV=fleet --dry-run
task wg:reconcile ENV=fleet
task wg:drift ENV=fleet
# erwartet: Exit 0
```
