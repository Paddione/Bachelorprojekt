---
title: "cluster-dev-node-gekko2 — Implementation Plan"
ticket_id: T002630
domains: [bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cluster-dev-node-gekko2 — Implementation Plan

_Ticket: T002630_

## File Structure

```
environments/dev-cluster.yaml                        (neu)  Cluster-Dev-Env, liefert DEV_DOMAIN
environments/dev.yaml                                (mod)  Rolle auf "nur lokales k3d" verengt
environments/schema.yaml                             (mod)  Quelldatei je DEV_*-Key benannt
scripts/flux-render-artifact.sh                      (mod)  sourct dev-cluster statt dev
k3d/dev-stack/dev-node-binding.yaml                  (neu)  Toleration + nodeAffinity role=dev
k3d/dev-stack/kustomization.yaml                     (mod)  Patch eingehaengt
wireguard/wg-mesh-nodes.yaml                         (mod)  gekko-hetzner-2 als Dev-Worker
scripts/fleet-membership-check.sh                    (neu)  Drift-Gate Registry vs. Cluster
Taskfile.yml                                         (mod)  task fleet:membership (S4-Erreichbarkeit)
docs/runbooks/cluster-dev-node-umbau.md              (neu)  operative Schritte am Node
tests/spec/fleet-operations/dev-env-split.bats       (neu)  P1-Abdeckung
tests/spec/fleet-operations/dev-node-binding.bats    (neu)  P2-Abdeckung
tests/spec/fleet-operations/membership-drift.bats    (neu)  P3-Abdeckung
```

**S1-Budgets** — wirksame Schwelle je Datei, alle betroffenen Dateien sind **nicht gebaselined**,
es gilt also das statische Limit aus `docs/code-quality/gates.yaml`:

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `scripts/flux-render-artifact.sh` | 370 | 800 (`.sh`) | 430 |
| `scripts/fleet-membership-check.sh` | neu | 800 (`.sh`) | auf ≤ 200 schneiden (Wachstumsreserve) |
| `environments/*.yaml`, `Taskfile.yml`, `wireguard/*.yaml` | — | — | `.yaml`/`.yml` stehen nicht in `s1.limits` → kein S1-Gate |

Kein Split erforderlich; keine Datei kommt in die Nähe von 80 % ihrer Schwelle.

**S3:** `dev.mentolder.de` darf in `k3d/` und `prod-fleet/` **nicht** als Literal erscheinen — die
Auflösung läuft ausschliesslich über `DEV_DOMAIN`/`envsubst`. In `environments/` ist der Wert
zulaessig, das Verzeichnis liegt nicht im S3-Scope.
**S4:** `fleet-membership-check.sh` wird über einen Taskfile-Eintrag erreichbar gemacht, sonst
Orphan-Violation.

## Partial-Manifest

| # | Partial | Rolle | Dateien (disjunkt) |
|---|---|---|---|
| P1 | Env-Entflechtung | infra | `environments/dev-cluster.yaml`, `environments/dev.yaml`, `environments/schema.yaml`, `scripts/flux-render-artifact.sh` |
| P2 | Dev-Node-Bindung | infra | `k3d/dev-stack/dev-node-binding.yaml`, `k3d/dev-stack/kustomization.yaml`, `wireguard/wg-mesh-nodes.yaml` |
| P3 | Drift-Gate | infra | `scripts/fleet-membership-check.sh`, `Taskfile.yml` |
| P4 | Betriebs-Runbook | infra | `docs/runbooks/cluster-dev-node-umbau.md` |
| P5 | Tests | test | `tests/spec/fleet-operations/*.bats` |

---

## P1 — Env-Entflechtung: eigene Datei für den Cluster-Dev-Stack

- [ ] **P1.1** `environments/dev-cluster.yaml` anlegen. Beschreibt **ausschliesslich** den
      fleet-gerenderten Dev-Stack: Domain `dev.mentolder.de`, Kontext `fleet`, Namespace
      `workspace-dev`, `DEV_DOMAIN` gesetzt. Struktur und Schluesselnamen von
      `environments/fleet-mentolder.yaml` uebernehmen, nicht neu erfinden — `env-resolve.sh`
      liest feste Namen.

- [ ] **P1.2** `environments/dev.yaml` auf ihre verbleibende Rolle verengen: Kopfkommentar, dass
      diese Datei **nur** die lokale k3d-Umgebung beschreibt und den Cluster-Dev-Stack **nicht**
      mehr steuert, mit Verweis auf `dev-cluster.yaml`. Ohne diesen Hinweis stellt der naechste
      Bearbeiter die Doppelrolle wieder her — sie war die Ursache des Ausgangsproblems.

- [ ] **P1.3** `environments/schema.yaml`: die Schluessel der neuen Umgebung deklarieren und beim
      Beschreibungstext von `DEV_DOMAIN` ergaenzen, aus **welcher** Datei der Renderer den Wert
      liest. Der bestehende Satz („Empty disables the dev stack") bleibt sachlich richtig und wird
      nur praezisiert, nicht ersetzt.

- [ ] **P1.4** `scripts/flux-render-artifact.sh`, Block „1b. Dev (workspace-dev namespace)":
      `source scripts/env-resolve.sh dev` auf `dev-cluster` umstellen. Die bestehende
      Fail-Closed-Logik **unveraendert lassen** — Abbruch bei fehlgeschlagenem `env-resolve.sh`
      und das leere, gueltige Kustomize-Verzeichnis bei leerem `DEV_DOMAIN`. Beides ist korrekt:
      fehlte das Verzeichnis, wuerde `prune: true` der `flux-dev`-Kustomization den Namespace
      leerraeumen. Den erklaerenden Kommentarblock darueber auf die neue Quelldatei aktualisieren.

## P2 — Dev-Node-Bindung

- [ ] **P2.1** `k3d/dev-stack/dev-node-binding.yaml` als Kustomize-Patch anlegen: Toleration für
      `role=dev` mit Effekt `NoSchedule` **und** `nodeAffinity`
      (`requiredDuringSchedulingIgnoredDuringExecution`) auf das Label `role=dev`, angewandt auf
      alle Workload-Kinds des Dev-Stacks. Beides ist noetig und ersetzt einander nicht: die
      Toleration *erlaubt* die Platzierung auf dem getainteten Node, die Affinitaet *erzwingt*
      sie. Ohne Affinitaet landen die Pods auf beliebigen anderen Nodes.

- [ ] **P2.2** `k3d/dev-stack/kustomization.yaml`: den Patch einhaengen.

- [ ] **P2.3** `wireguard/wg-mesh-nodes.yaml`: Eintrag `gekko-hetzner-2` aktualisieren. Der
      bestehende Warnkommentar („Peer lebt, aber Node ist nicht Teil des fleet-Clusters") wird
      durch die Dev-Node-Rolle ersetzt. `pod_cidr` **erst nach dem Join** auf den vom Cluster
      tatsaechlich zugewiesenen Wert setzen (`kubectl --context fleet get node gekko-hetzner-2 -o
      jsonpath='{.spec.podCIDR}'`) — der alte Wert `10.42.6.0/24` stammt aus der Zeit vor dem
      Herausfallen und kann inzwischen neu vergeben sein. Ein falscher `pod_cidr` in `AllowedIPs`
      laesst WireGuard die Pod-Pakete lautlos verwerfen (T002491).

## P3 — Drift-Gate

- [ ] **P3.1** `scripts/fleet-membership-check.sh` schreiben (≤ 200 Zeilen): liest die deklarierte
      Node-Menge aus `wireguard/wg-mesh-nodes.yaml`, vergleicht sie mit `kubectl --context fleet
      get nodes -o name` und meldet **beide** Richtungen — deklariert-aber-abwesend und
      im-Cluster-aber-undeklariert. Exit ≠ 0 bei Drift mit namentlicher Nennung, Exit 0 bei
      Deckungsgleichheit. Ist kein Cluster erreichbar, wird mit klarer Meldung **uebersprungen**
      statt rot gemeldet: das Gate laeuft auch in CI-Umgebungen ohne Cluster-Zugang.

- [ ] **P3.2** `Taskfile.yml`: Task `fleet:membership` ergaenzen, der das Skript aufruft. Erfuellt
      zugleich die S4-Erreichbarkeit — ein Skript ohne Aufrufer ist eine Orphan-Violation.

## P4 — Betriebs-Runbook

- [ ] **P4.1** `docs/runbooks/cluster-dev-node-umbau.md` schreiben. Die Schritte am Node sind
      operativ, einmalig und nicht durch CI abgedeckt — deshalb dokumentiert statt in ein Skript
      gegossen, das nach einem Lauf verwaist:

      1. **Sicherung zuerst.** 1,7 GB aus 8 PVCs unter `/var/lib/rancher/k3s/storage/` als Tarball
         ziehen und **vom Node herunterkopieren**, bevor irgendetwas geloescht wird.
      2. **Schatten-k3s entfernen** (`/usr/local/bin/k3s-uninstall.sh`).
      3. **Als Agent joinen** — Node-Token aus `/var/lib/rancher/k3s/server/node-token` eines
         CP-Nodes. **Ausdruecklich die Agent-Installation:** der Vorfall vom 2026-07-03 entstand
         dadurch, dass ein Server-Install den Agent ueberschrieb und der Node damit still aus dem
         Cluster fiel.
      4. **Label und Taint setzen**, danach `wg-fleet`-Peer und `pod_cidr` verifizieren (Eingang
         für P2.3).
      5. **`tls-san` nachziehen** auf `pk-hetzner-6` und `-8`: jeweilige oeffentliche Adresse in
         `/etc/rancher/k3s/config.yaml` eintragen, alte Server-Zertifikate entfernen, k3s neu
         starten. Danach pruefen, dass ein `kubectl`-Aufruf gegen **jeden** CP-Node ohne
         x509-Fehler durchlaeuft — das ist der eigentliche Verfuegbarkeitsgewinn dieses Vorgangs.
      6. **DNS umstellen:** `dev.mentolder.de` von `153.92.37.9` auf die oeffentliche Adresse des
         Dev-Nodes; anschliessend ACME-Ausstellung abwarten und das Zertifikat pruefen.

## P5 — Tests

- [ ] **P5.1 — Failing-Test-Step (RED).** Die drei BATS-Dateien unter
      `tests/spec/fleet-operations/` anlegen (Verzeichnis-Konvention T002416). Sie pruefen
      **Kommando-Ergebnisse, nicht Implementierungsquellen** (T002448-M4): der Renderer wird
      ausgefuehrt und seine Ausgabe bewertet, das Membership-Skript wird ausgefuehrt und
      Exit-Code plus Ausgabe geprueft. Der Header-Kommentar jeder Datei nennt den Pruefmodus.

      Abzudeckende Aussagen:
      - `dev-env-split.bats` — Renderer mit gesetztem `DEV_DOMAIN` in `dev-cluster.yaml` erzeugt
        ein `dev/`-Verzeichnis **mit** Workloads; mit leerem Wert ein gueltiges leeres
        Kustomize-Verzeichnis bei Exit 0; ein leeres `DEV_DOMAIN` in `dev.yaml` schaltet den
        Cluster-Stack **nicht** mehr ab.
      - `dev-node-binding.bats` — `kustomize build k3d/dev-stack` liefert für jeden Workload
        Toleration **und** nodeAffinity auf `role=dev`. **Positiv-Anker zuerst** (T002356-M1):
        erst belegen, dass die Kandidatenliste nicht leer ist, dann die Negativ-Aussage pruefen.
        Ohne Anker bestuende der Test vakuos, sobald der Build gar nichts liefert.
      - `membership-drift.bats` — bei kuenstlich abweichender Registry Exit ≠ 0 mit namentlicher
        Nennung des fehlenden Nodes; bei Deckungsgleichheit Exit 0.

      Assertions gegen `$output` auf die relevante Zeile eingrenzen statt gegen den vollen
      stdout+stderr zu matchen: Skripte, die `$0` in ihrer Usage ausgeben, liessen sonst den
      Worktree-Namen `wt-cluster-dev-node-gekko2` den Match erfuellen, obwohl das Feature fehlt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/
# expected: FAIL (rot — dev-cluster.yaml, Node-Bindung und Membership-Skript existieren noch nicht)
```

- [ ] **P5.2 — GREEN.** Nach P1–P3 laufen alle drei Dateien gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/
```

- [ ] **P5.3 — Finale Verifikation.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
