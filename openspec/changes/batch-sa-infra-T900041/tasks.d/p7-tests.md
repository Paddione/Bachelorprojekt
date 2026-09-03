---
title: "p7-tests — Guard-Tests SA-Infra-Fixes (T900041)"
ticket_id: T900041
domains: [fleet-operations]
status: active
target_files: ["tests/spec/fleet-operations/vaultwarden-smtp-from.bats", "tests/spec/fleet-operations/penpot-secret-keys.bats", "tests/spec/fleet-operations/monitoring-ready.bats", "tests/spec/fleet-operations/cronjob-hygiene.bats", "tests/spec/fleet-operations/ghcr-pull-secret.bats", "tests/spec/fleet-operations/readiness.bats"]
---

# p7-tests — Guard-Tests SA-Infra-Fixes (T900041)

## Goal

Die Tests-Rolle des Batch: fuer jedes Kind-Ticket (T900028, T900030, T900034, T900035, T900036,
T900037) einen BATS-Guard in `tests/spec/fleet-operations/` anlegen, der den Zustand VOR dem Fix
reproduziert und auf `expected: FAIL` laeuft. Damit ist die Rot-Gruen-Verpflichtung des Fix-Pfads
erfuellt (STRUCT2).

## File Structure

```
tests/spec/fleet-operations/vaultwarden-smtp-from.bats   # NEW: Patch enthaelt SMTP_FROM
tests/spec/fleet-operations/penpot-secret-keys.bats      # NEW: Schema/SealedSecrets enthalten 3 Keys
tests/spec/fleet-operations/monitoring-ready.bats        # NEW: blackbox non-root SecurityContext
tests/spec/fleet-operations/cronjob-hygiene.bats         # NEW: ttl/suspend/korrekte URL
tests/spec/fleet-operations/ghcr-pull-secret.bats        # NEW: Secret in beiden Namespaces
tests/spec/fleet-operations/readiness.bats               # NEW: Probe-Werte/Deckung
```

## Tasks

1. **Failing-Test-Step (RED).** Die sechs Guard-Tests anlegen (je einer pro Ticket). Jeder Test
   nutzt `bats` und einen Guard, damit er auf dem aktuellen (unbehobenen) Stand FEHLSCHLAEGT:

```bash
# Requirement: Guard-Tests reproduzieren den unbebostenen Zustand
# expected: FAIL (die Fixes in p1–p6 sind noch nicht implementiert)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/
```

2. **Fix-Bestaetigung (GREEN).** Nachdem p1–p6 die Fixes umgesetzt haben, muessen dieselben Guards
   gruen sein. Die Guards duerfen keine externen Cluster-Zustaende hart fordern (kein kubectl-Exec
   gegen live-Cluster) — sie pruefen die Manifest-/Schema-/SealedSecret-Inhalte statisch.

3. **Final Verification.** Die drei Pflicht-CI-Gates des Gesamtplans:

```bash
task test:changed; task freshness:regenerate; task freshness:check
```

Hinweis: `task test:changed` deckt die neuen BATS-Dateien unter `tests/spec/fleet-operations/` ab;
Regressionen in anderen Domains werden ueber den smart-select-Mechanismus mitgezogen. Der
`batch_id: T900041`-Anker stellt sicher, dass diese Tests zusammen mit den p1–p6-Fixes in einem
Merge-Zyklus geschlossen werden.
