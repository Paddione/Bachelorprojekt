# Proposal: rejoin-gekko-hetzner2-fleet

## Why

Der Worker-Node `gekko-hetzner-2` (10.20.0.4) fehlt seit dem Join vor 85 Tagen im fleet-Cluster
(`kubectl get nodes` listet nur gekko-hetzner-3/-4 und pk-hetzner-4/6/8), die Maschine ist aber
ping-bar. Longhorn meldet den Node `READY=False`/`SCHEDULABLE=False`; Folge ist ein
Prometheus-PVC (monitoring, ~38 GB) mit `robustness=degraded` — ein weiterer Node-Ausfall würde
die Monitoring-Historie gefährden.

**Operatoren-Entscheidung vom 2026-08-24 (T016442): REJOIN, keine Dekommissionierung.** Damit wird
die frühere Dekommissionierungs-Entscheidung (T016425, archiviert) revidiert; der Node soll
repariert und wieder in den Cluster aufgenommen werden.

Zuletzt lief auf dem Node ein eigenständiger Single-Node-k3s (Server-Install), der den Agent
überschrieben und den Node damit still aus dem Cluster fallen ließ — dokumentiert in
`docs/runbooks/cluster-dev-node-umbau.md` (2026-07-03). Longhorn bestätigt das Ereignis als
`KubernetesNodeGone` seit `2026-07-03T20:57:50Z`.

_Ticket: T016442_ · Parent-Epic: T016422 (WSL-Exit)

## What Changes

1. **Runbook** `docs/runbooks/rejoin-k3s-node.md` (Schwester zu `decommission-k3s-node.md`):
   verbindliche Reihenfolge — Ursache prüfen (k3s-Agent-Service) → k3s-Agent-Installation
   reparieren/wiederherstellen → Node als **Agent** rejoinen → Longhorn-Node-`READY=True` prüfen →
   Prometheus-PVC `robustness=healthy` verifizieren. Manuelle Operator-/SSH-Schritte sind explizit
   markiert und dürfen nicht vom autonomen Factory-Tick ausgeführt werden.

2. **Verifikationsskript** `scripts/factory/verify-rejoin.sh` (Inverse von
   `verify-decommission.sh`): rein lesend — prüft, dass der Node im Cluster **anwesend** und
   `Ready` ist, dass der Longhorn-Node `READY=True` + `SCHEDULABLE=True` ist und dass kein
   Longhorn-Volume `degraded` ist. Exit 0 = sauber rejoined.

3. **RED-Test** `tests/spec/fleet-operations/hetzner2-rejoin.bats` (Schwester zur
   Decommission-Testdatei): assertions für Runbook-Existenz, Verifikationsskript
   (read-only, Usage-Guard) und — sobald die Phase-Implementierung greift — die
   Output-Verifikation der Rejoin-Voraussetzungen.

4. **SSOT-Delta** auf `openspec/specs/fleet-operations.md`: neues Requirement „Dedicated Node
   Rejoin Recovers Readiness" — ein deklarierter fleet-Worker-Node, der mit `READY=False`
   gemeldet wird, ist wieder in den Cluster zu rejoinen, und die Verification ist lesend
   abzusichern.

## Architektur-Entscheidungen

- **Rejoin statt Dekommissionierung** (Operator): die Maschine ist ping-bar und die frühere
  Server-k3s-Last (Dev-Stacks) soll erhalten bleiben; der Node wird als **Agent** rejoined
  (nicht Server), genau wie im bestehenden Umbau-Runbook beschrieben.
- **Agent-Installation ist die Reparatur-Ebene**: Ursache des ursprünglichen Ausfalls war ein
  Server-Install, der den Agent überschrieb. Die Rejoin-Prozedur stellt sicher, dass die
  Agent-Variante läuft.
- **Verifikation ist rein lesend**: der Factory-Tick führt nur lesende Check-Schritte aus;
  destruktive/live-SSH-Schritte bleiben Operator.
- **Dokumentation statt Einweg-Skript**: wie beim Decommission-Runbook gilt das Muster
  „Runbook + lesendes Verify-Skript + CI-BATS", kein eigenmächtiges live-Skript.

## Impact

- Affected specs: `fleet-operations`
- Affected code: `docs/runbooks/rejoin-k3s-node.md` (neu),
  `scripts/factory/verify-rejoin.sh` (neu), `tests/spec/fleet-operations/hetzner2-rejoin.bats` (neu)
- Kein Verhalten im Repo selbst; Wirkung entfaltet das Runbook erst bei Operator-Ausführung
  gegen das Live-Fleet. Kein Konflikt mit dem (archivierten) Decommission-Pfad.
