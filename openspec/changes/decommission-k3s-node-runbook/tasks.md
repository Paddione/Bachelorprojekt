---
title: "decommission-k3s-node-runbook — Implementation Plan"
ticket_id: T016425
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# decommission-k3s-node-runbook — Implementation Plan

_Ticket: T016425_

## File Structure

```
docs/runbooks/decommission-k3s-node.md                    # NEU (Deliverable)
openspec/changes/decommission-k3s-node-runbook/           # Proposal + Delta (liegt vor)
```

## Kontext

- Befund (live verifiziert 2026-08-24): Node `gekko-hetzner-2` fehlt im
  Cluster seit Join vor 85d, ping-bar unter 10.20.0.4; Longhorn
  READY=False; Prometheus-PVC (ns monitoring, ~38 GB) robustness=degraded.
- Operator-Entscheidung: DEKOMMISSIONIEREN (Dublette T016427 „rejoinen"
  ist obsolete).
- **Keine autonome Ausführung:** Das Runbook dokumentiert destruktive
  kubectl-Schritte nur; Ausführung = Operator/begleitete Session.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED): ENTFALLT.** Reines Runbook-Markdown ohne
      Testsurface; stattdessen Struktur-Nachweis:

```bash
grep -c '^## ' docs/runbooks/decommission-k3s-node.md   # Abschnitte vorhanden
# expected: >= 6 (Vorab-Checks, Dekommissionierung, Longhorn-Rebuild,
#            Prometheus-PVC, Hetzner-Kündigung, Abbruchkriterien)
```

- [ ] **Fix-Step (GREEN).** Runbook schreiben mit: je Schritt
      Verifikationskommando + erwartete Ausgabe; `kubectl delete node
      gekko-hetzner-2` erst nach Drain-Fallback-Check; Longhorn-Rebuild-
      Verifikation auf hetzner-3/-4; PVC-Robustheit healthy; Hetzner-
      Kündigung als manueller Operator-Punkt; Abbruchkriterium bei
      ausbleibendem Rebuild (Stop + Eskalation). Format wie bestehende
      Runbooks (Deutsch, bash-Blöcke).

```bash
test -f docs/runbooks/decommission-k3s-node.md && echo PRESENT
# expected: PRESENT
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
