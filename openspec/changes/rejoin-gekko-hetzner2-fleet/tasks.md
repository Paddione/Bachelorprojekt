---
title: "rejoin-gekko-hetzner2-fleet — Implementation Plan"
ticket_id: T016442
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rejoin-gekko-hetzner2-fleet — Implementation Plan

_Ticket: T016442_ · Pfad: fix · SSOT: `fleet-operations`

## File Structure

```
docs/runbooks/rejoin-k3s-node.md                        (neu — Rejoin-Runbook, Schwester zu decommission-k3s-node.md)
scripts/factory/verify-rejoin.sh                        (neu — lesende Rejoin-Verifikation, Schwester zu verify-decommission.sh)
tests/spec/fleet-operations/hetzner2-rejoin.bats        (neu — RED-Test, Schwester zu hetzner2-decommission.bats)
openspec/changes/rejoin-gekko-hetzner2-fleet/specs/fleet-operations.md
```

Keine dieser Dateien existiert derzeit (alle `nicht-baselined`, unter den statischen Limits:
`.sh` 800, `.md`/`.bats` unkritisch). Keine `components/website/src/**`-Dateien betroffen → keine
CQ02-/Vitest-Auflagen. S3 gilt nicht (kein fleets/Prod-Manifest). S4: das neue `verify-rejoin.sh`
wird vom Runbook referenziert, das Skript selbst wird vom Runbook-Schritt und vom BATS-Test
erreicht — kein Orphan.

## Task 1 — Rejoin-Runbook anlegen

Schreibe `docs/runbooks/rejoin-k3s-node.md` als Schwester des bestehenden
`decommission-k3s-node.md`. Das Runbook dokumentiert die verbindliche Reihenfolge zur
Wiederaufnahme eines fleet-Worker-Nodes, der `READY=False` in Longhorn meldet und in
`kubectl get nodes` fehlt, aber ping-bar ist.

Pflicht-Abschnitte (die der RED-Test ausschließlich prüft):
- `Ursache prüfen` — k3s-Agent-Service prüfen/neu starten, Server-Install als historische
  Ursache berücksichtigen (siehe `cluster-dev-node-umbau.md`).
- `Agent rejoinen` — Node als k3s-**Agent** (nie Server) rejoinen, Node-Token vom
  Control-Plane holen.
- `Longhorn-Node` — `kubectl --context fleet -n longhorn-system get nodes.longhorn.io` →
  `READY=True` + `SCHEDULABLE=True` verifizieren.
- `Prometheus-PVC` — `kubectl --context fleet -n monitoring get pvc` und das zugehörige
  Longhorn-Volume auf `robustness=healthy` prüfen.
- `Abschluss` — den `verify-rejoin.sh`-Aufruf als lesende Schlussprüfung angeben.

Jeder Schritt, der SSH auf den Node oder ein schreibendes kubectl/Systemctl erfordert, wird
explizit mit `MANUELL — Operator` markiert und darf nicht vom autonomen Factory-Tick ausgeführt
werden. Das Runbook legt die Ausführungsgrenze klar fest und verweist auf
`cluster-dev-node-umbau.md` für die konkrete Join-Mechanik.

```bash
# Sichtprüfung: Abschnittsnamen + manueller Gate-Marker vorhanden
grep -E "Ursache prüfen|Agent rejoinen|Longhorn-Node|Prometheus-PVC|Abschluss" docs/runbooks/rejoin-k3s-node.md
grep -c "MANUELL — Operator" docs/runbooks/rejoin-k3s-node.md
```

## Task 2 — Lesende Rejoin-Verifikation anlegen

Schreibe `scripts/factory/verify-rejoin.sh` als Inverse von `verify-decommission.sh`. Das
Skript ist **rein lesend** (keine schreibenden kubectl-Verben) und verlässt mit Exit 0 nur,
wenn der Node sauber rejoined ist.

Semantik (Ausführung gegen den Live-Cluster, Context `KUBECTL_CONTEXT` default `fleet`):
1. Node `gekko-hetzner-2` ist im Cluster anwesend und `Ready`.
2. Longhorn-Node `gekko-hetzner-2` meldet `READY=True` und `SCHEDULABLE=True`.
3. Kein Longhorn-Volume meldet `robustness=degraded` (Prometheus-PVC wieder healthy).

Usage-Guard: ohne Argument `Usage: verify-rejoin.sh <node-name>` mit Exit != 0. Der erste
Test des RED-Suite hängt an den Read-Only- und Usage-Eigenschaften; die Live-Zustände (1–3)
werden im Ausführungs-Runbook Schritt `Abschluss` verifiziert, weil CI den Cluster nicht
garantiert verfügbar hat (T002820-Guard-Logik: derealisierbar, kein Runner-Ausstattungs-Test).

## Task 3 — RED-Test (failing) [expected: FAIL]

Der RED-Test `tests/spec/fleet-operations/hetzner2-rejoin.bats` liegt bereits im Worktree und
schlägt aktuell fehl, weil Runbook und Skript noch fehlen. Erreicht nach der Fertigstellung von
Task 1 und Task 2. Ausführung:

```bash
# eigener Datei-Pfad unter tests/spec/fleet-operations/ (T002416)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/hetzner2-rejoin.bats
# expected: FAIL — vorher (Runbook/Skript fehlen), grün nach Task 1+2
```

Anschließend das Test-Inventar regenerieren und einchecken (neue BATS-Datei):

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
```

## Task 4 — Finale Verifikation (GREEN)

Lasse die drei verbindlichen Quality-Gates laufen; alle müssen grün sein:

```bash
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

- `task test:changed` — gezielte Tests für die geänderten Domains (BATS + quality).
- `task test:inventory` — Test-Inventar frisch halten (neue BATS-Datei erfasst).
- `task freshness:regenerate` — generierte Artefakte aktualisieren.
- `task freshness:check` — CI-Äquivalent: Freshness + S1–S4-Ratchet + Baseline-Assertion.

Die drei Baseline-Dateien dieser Änderung sind alle neu und `nicht-baselined` — es wächst
keine Baseline. Keine bestehende Datei wird vergrößert.
```
