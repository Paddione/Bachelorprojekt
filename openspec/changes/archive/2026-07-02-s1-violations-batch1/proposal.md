---
title: "G-RH01: S1-Frozen-Violations Batch 1 — baseline.json 98→≤30"
ticket_id: T001108
domains: [quality, infra, website, brett]
status: active
file_locks: [docs/code-quality/baseline.json]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: s1-violations-batch1 (G-RH01)

## Why

Das S1-Gate (`scripts/code-quality/check.mjs`/`load.mjs`) friert Dateien >500 Zeilen in `docs/code-quality/baseline.json` ein, damit CI nicht bei jeder Vergrößerung rot wird. Aktuell enthält die Baseline **98 Einträge** — Tendenz steigend. Das verwässert das Gate: zu viele "akzeptierte" Verstöße verstecken echte neue Violations.

Ziel: **baseline.json 98 → ≤ 30**. Drei Hebel: (A) stale/gelöste Einträge via `task quality:baseline:refresh` entfernen — quick win, ~63 Einträge, keine Code-Änderung; (B) Vendor- und Generated-Dateien dauerhaft ausschließen (z.B. `GLTFLoader.js` 3629 Zeilen, `agent-guide.generated.json` 2134 Zeilen); (C) die verbliebenen größten Source-Dateien aufteilen (z.B. `questionnaire-db.ts` 1227 → <500 Zeilen via Module-Split).

## What

- `task quality:baseline:refresh` ausführen → erwartet 98→~35 Einträge
- `scripts/code-quality/load.mjs` (oder `.s1-ignore`) um Vendor/Generated-Patterns erweitern
- `website/src/lib/questionnaire-db.ts` (1227 Zeilen) in 3-4 Module aufteilen (`queries.ts`, `scoring.ts`, `types.ts`, `index.ts` als Re-Export-Compat-Layer) — kein API-Bruch
- `docs/code-quality/baseline.json` final refresh → ≤30 Einträge
- BATS-Regression: `tests/spec/s1-violations.bats` zählt Baseline-Einträge, **RED bei >30, GREEN bei ≤30**

_Ticket: T001108_
