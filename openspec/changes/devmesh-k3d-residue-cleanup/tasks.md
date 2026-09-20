---
title: "devmesh-k3d-residue-cleanup — Implementation Plan"
ticket_id: T900120
domains: [infra, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-k3d-residue-cleanup — Implementation Plan

_Ticket: T900120 · Programm T900115 (ADR-008 SP-5, P3) · Delta: `specs/local-dev-mesh.md`
(1 ADDED, 1 MODIFIED, 2 REMOVED)_

## File Structure

```
CHANGED:
  scripts/devmesh/migrate-from-k3d.sh                    (P2)
  tests/spec/local-dev-mesh/migrate-from-k3d.bats        (P1)
  tests/spec/local-dev-mesh/no-k3d-context.bats          (P1)
  CLAUDE.md                                              (P3)
  components/website/src/data/test-inventory.json        (P4, generiert)
NEW:
  openspec/changes/devmesh-k3d-residue-cleanup/proposal.md
  openspec/changes/devmesh-k3d-residue-cleanup/tasks.md
  openspec/changes/devmesh-k3d-residue-cleanup/specs/local-dev-mesh.md
UNCHANGED (ausdrücklich abgegrenzt):
  k3d/docs-content-built/**    generiertes HTML, Generator scripts/build-docs.mjs
  docs/adr/**                  historische Entscheidungen, werden per Nachtrag fortgeschrieben
  scripts/ticket.sh            parallele Arbeit an T900239
  scripts/vda/ticket/**        parallele Arbeit an T900239
```

## Messstand

Gegen diesen Stand ist der Befund erhoben; ohne ihn ist die Zahl später nicht nachstellbar.

```bash
# Stand: origin/main am 2026-09-20
kubectl config get-contexts -o name          # devmesh, fleet, k3d-mentolder-dev
k3d cluster list                             # leer — der Cluster existiert nicht mehr
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/no-k3d-context.bats
# 1 von 2 Tests rot: docs/spec-atlas.md, openspec/specs/local-dev-mesh.md
ls -l ~/backups/k3d-mentolder-dev-shared-db-final-2026-08-23.sql.gz   # 75045023 Bytes
```

## P1 — Guards (RED)

- [ ] **P1.1 Failing-Test-Step (RED).** `tests/spec/local-dev-mesh/migrate-from-k3d.bats` auf die
  Dump-Quelle umschreiben: Fixture ist ein kleiner `pg_dumpall`-Text mit `\connect`- und
  `COPY … FROM stdin;`-Blöcken, `kubectl` bleibt gestubbt und liefert nur die Ziel-Zeilenzahlen.
  Vier Fälle: `counts` schreibt je Datenbank eine Zähldatei; `verify` mit gleichen Zahlen endet 0
  und nennt die Tabelle; `verify` mit einer abweichenden Tabelle endet 1 und nennt sie;
  `preflight` mit fehlendem `DEVMESH_SRC_DUMP` endet 2 und nennt den Pfad; `DEVMESH_DST_CTX=fleet`
  wird vor dem ersten `kubectl`-Aufruf verweigert.

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/migrate-from-k3d.bats
  # expected: FAIL (red — das Skript liest noch aus dem Kubeconfig-Context)
  ```

- [ ] **P1.2** `tests/spec/local-dev-mesh/no-k3d-context.bats`: `docs/spec-atlas.md` dauerhaft
  ausnehmen (generiert, führt Requirement-Titel wörtlich), die `openspec/specs`-Ausnahme von
  `devmesh-k3d-decommission` auf `devmesh-k3d-residue-cleanup` umhängen. Der Positiv-Anker gegen
  `docs/adr` bleibt unverändert — ohne ihn bewiese ein leeres Suchergebnis nichts.

## P2 — migrate-from-k3d.sh auf Dump-Quelle

- [ ] **P2.1** Kopf und Variablen: `DEVMESH_SRC_DUMP` mit Default
  `$HOME/backups/k3d-mentolder-dev-shared-db-final-2026-08-23.sql.gz`; `DEVMESH_SRC_CLUSTER`,
  `DEVMESH_SRC_CTX` und `SRC_CTX` entfallen. Der Kommentarkopf nennt Quelle, Datum und warum der
  Cluster nicht mehr die Quelle ist.
- [ ] **P2.2** `preflight`: Ziel-Guard (`fleet`/`*prod*` verweigert) vor jedem `kubectl`-Aufruf,
  Ziel-Context in `kubectl config get-contexts` vorhanden, Dump-Datei vorhanden und als gzip
  lesbar. Fehlende Vorbedingung endet 2, verweigertes Ziel endet 1. Der Vergleich des
  `POCKET_ID_ENCRYPTION_KEY` zwischen Quelle und Ziel entfällt: der Quell-Key lag im
  Kubernetes-Secret des abgebauten Clusters, nicht im Dump. Der Kopf hält fest, dass ein
  abweichender Key die `pocket_id`-Daten unlesbar macht.
- [ ] **P2.3** `counts` (ersetzt `dump`): den Dump einmal streamen und je `\connect <db>` die
  Zeilen jedes `COPY <schema>.<table> … FROM stdin;`-Blocks bis zum abschließenden `\.` zählen;
  Ergebnis je Datenbank nach `$DUMP_DIR/<db>.counts` im bestehenden Format `schema.table|n`.
  Nur die Datenbanken aus `DEVMESH_MIGRATE_DBS` werden geschrieben.
- [ ] **P2.4** `verify` behält Format und Exit-Codes, liest die erwarteten Zahlen aus den
  `counts`-Dateien und die tatsächlichen aus der devmesh-`shared-db`. `restore`, `DST_WRITERS`,
  der Port-Forward-Block und `all`s Restore-Zweig entfallen; `all` ist `preflight`, `counts`,
  `verify`.
- [ ] **P2.5 GREEN:** P1.1 ist grün.

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/migrate-from-k3d.bats tests/spec/local-dev-mesh/no-k3d-context.bats
  ```

## P3 — CLAUDE.md gegen den lebenden Cluster

Jede Zeile wird gegen `kubectl config get-contexts -o name` geprüft, nicht gegen den Dateitext.

- [ ] **P3.1** Prerequisites-Zeile: `k3d` entfällt, weil kein Pfad es mehr aufruft.
- [ ] **P3.2** Das Oracle-Beispiel „create a fresh k3d cluster" durch ein Beispiel ersetzen, das
  einem existierenden Task entspricht.
- [ ] **P3.3** Die Zusicherung „`fleet` is the only kubeconfig context in active use" und die
  Zeile „Any context … besides `fleet` and `hetzner` … points at decommissioned hardware"
  korrigieren: aktiv sind `fleet` (Prod) und `devmesh` (Entwicklung); einen Context `hetzner`
  gibt es nicht. Der Satz zum abgebauten WSL-k3d-Cluster bleibt, er stimmt.

## P4 — Verify (GREEN)

- [ ] **P4.1** Test-Inventar und Freshness-Artefakte neu erzeugen und einchecken.
- [ ] **P4.2 Final Verification.** Die drei Pflicht-Gates:

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

## P5 — Live-Schritt nach dem Merge (kein Repo-Change)

- [ ] **P5.1** Die Karteileiche aus der Kubeconfig entfernen und das Ergebnis messen:

  ```bash
  kubectl config delete-context k3d-mentolder-dev
  kubectl config get-contexts -o name    # erwartet: devmesh, fleet
  ```
