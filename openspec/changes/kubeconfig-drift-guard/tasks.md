---
title: "kubeconfig-drift-guard — Implementation Plan"
ticket_id: T015008
domains: [infra, tickets]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# kubeconfig-drift-guard — Implementation Plan

_Ticket: T015008_

## File Structure

```
scripts/vda/ticket/_ctx-guard.sh        # NEW: Loopback-Drift-Guard (standalone aufrufbar + sourcable)
scripts/ticket.sh                       # WIRE-IN: Guard-Aufruf nach CTX-Auflösung im Write-Command-Set
tests/spec/db-guard/kubeconfig-drift-guard.bats  # RED-Guard, im Stage-Commit enthalten (5 Tests, rot verifiziert)
```

Disjunkte Partials (D1): p1 berührt `scripts/vda/ticket/_ctx-guard.sh` +
`scripts/ticket.sh`, p2 nur Tests.

## Partial P1 — p1-impl

- [x] **P1.1 Guard-Skript.** `scripts/vda/ticket/_ctx-guard.sh`: Aufruf
      `bash _ctx-guard.sh <CTX>` (und sourcable als Funktion). Liest
      `kubectl config view --context <CTX> -o jsonpath='{.contexts[?(@.name=="<CTX>")].context.cluster}'`
      → Clustername → `.clusters[?(@.name==…)].cluster.server` → Host-Extraktion.
      Host matcht `127.*|::1|localhost` → Exit 1 mit Meldung, die „loopback",
      Context-Namen, gefundenen Server und Remediation (`TICKET_CTX`-Override bzw.
      kubeconfig-Repair) nennt — sonst Exit 0. `TICKET_ALLOW_LOCAL_CTX=1` →
      `WARN:`-Zeile auf stderr und Exit 0. Fehlender Context/Server → Exit 1
      (fail-closed). Kein Cluster-Zugriff nötig (nur lokale Config-Datei).

- [x] **P1.2 Wire-In ticket.sh.** Nach dem CTX-Case-Block (~Zeile 115), vor dem
      Source von `_ticket-core.sh`: wenn `$TICKET_OFFLINE != 1` und das Kommando
      im Write-Set liegt (create, update-status, update-fields, set-parent,
      add-comment, archive-plan, enqueue, stage-plan, release-hold),
      `bash "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/_ctx-guard.sh" "$CTX"` ausführen.

- [x] **P1.3 Smoke.** `bash scripts/ticket.sh get --id T014735` (Read-Pfad,
      unguardiert) funktioniert weiterhin; ein Write mit manipulierter
      Fixture-Kubeconfig bricht mit Drift-Meldung ab.

## Partial P2 — p2-tests (Tests-Rolle, STRUCT2)

- [x] **P2.1 Failing-Test-Step (RED).** Der Guard
      `tests/spec/db-guard/kubeconfig-drift-guard.bats` liegt dem Stage-Commit
      bei und ist dort rot verifiziert (Exit 127 — Skript fehlt):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/
# expected: FAIL (red — Guard-Skript existiert vor P1 nicht)
```

- [x] **P2.2 GREEN-Nachweis.** Nach P1 müssen alle 5 Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-guard/
```

- [ ] **P2.3 Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
