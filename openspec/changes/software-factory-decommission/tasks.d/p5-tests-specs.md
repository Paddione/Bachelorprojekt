---
title: "p5 — Decommissioning guard, test suite retirement, and spec updates"
ticket_id: T900399
domains: [testing]
status: active
---

# p5 — Decommissioning guard, test suite retirement, and spec updates

Files: `tests/spec/software-factory/decommission-guard.bats`, `openspec/specs/software-factory.md` (target_files dieses Partials; disjunkt zu p1–p4).

## Task 5.1: Failing Decommissioning Guard anlegen (RED)

Neuen BATS-Guard unter `tests/spec/software-factory/decommission-guard.bats` schreiben.
Der Guard prüft:
1. Keine aktiven systemd User-Units für `factory.timer`, `factory.service`, `factory-mcp.service`.
2. Keine `factory-runner`-Ressourcen in `k3d/dev-stack/kustomization.yaml`.
3. Keine verbliebenen Dateien in `scripts/factory/`.

Rot-Nachweis vor der Umsetzung der vorherigen Partials:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/decommission-guard.bats
# expected: FAIL (red — the factory timer and manifests are currently still active)
```

## Task 5.2: Bereinigung obsolet gewordener Factory-Tests

1. Entfernen der alten Factory-Tests, die auf gelöschte Skripte / Runner basieren:
   - `tests/spec/software-factory/` (außer `decommission-guard.bats`)
   - `tests/spec/factory-*.bats`
   - `tests/unit/factory-*.bats`
   - `tests/unit/vda-factory-slots.bats`

## Task 5.3: Grün-Nachweis & OpenSpec SSOT-Update (GREEN)

1. Decommissioning-Guard erneut ausführen — muss jetzt grün sein:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/decommission-guard.bats
   ```
2. Aktualisieren von `openspec/specs/software-factory.md` mit dem Decommissioned-Status.
