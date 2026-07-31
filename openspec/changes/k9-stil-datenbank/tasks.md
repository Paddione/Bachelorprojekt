---
title: "K9: Stil-Datenbank als Gestaltungsquelle"
ticket_id: T002468
domains: [design-system]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# K9: Stil-Datenbank als Gestaltungsquelle — Implementation Plan

**Ticket:** T002468
**Epic:** T002458 (Cockpit-Gesamtkonzept)
**Branch:** `feature/stil-datenbank-T002468`
**Spec:** `openspec/changes/k9-stil-datenbank/design.md`

## File Structure

```
openspec/changes/k9-stil-datenbank/
├── proposal.md          # Warum/Was (E14: Gestaltungsquelle für Modelle)
├── design.md            # Architektur: Datenebene + Beitragspfad + Zugriff
├── specs/sdlc-cockpit.md# Delta auf SSOT sdlc-cockpit (D14, E14)
├── tasks.md             # dieser Plan
└── tasks.d/
    ├── p1-datenebene.md # JSON-Schema + Beispiel-Einträge + index.json
    ├── p2-beitragspfad.md # Validierung + Verzeichnis/Index + Doku
    ├── p3-zugriff.md    # Adapter data.styles() + Daemon-Route /api/cockpit/styles
    └── p4-tests.md      # BATS: Schema/Beitragspfad/Route + Vitest: Adapter
```

## Partials

| Partial | File | Role | Files | Depends |
|---------|------|------|-------|---------|
| p1 | tasks.d/p1-datenebene.md | implementation | `.lavish/styles/schema.json`, `.lavish/styles/status-panel-akzent.json`, `.lavish/styles/rail-nav-tokens.json` | |
| p2 | tasks.d/p2-beitragspfad.md | implementation | `.lavish/styles/index.json`, `.lavish/styles/README.md` | p1 |
| p3 | tasks.d/p3-zugriff.md | implementation | `.lavish/kit/adapter.js`, `.lavish/kit/daemon/server.ts` | p1, p2 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/sdlc-cockpit/k9-stil-datenbank.bats`, `tests/unit/cockpit-styles.test.ts` | p3 |

**Disjunktheit:** Keine Datei kommt in mehr als einem Partial vor (D1).

**Pipeline:** Partials werden in Reihenfolge p1→p2→p3→p4 gestaged und enqueued. p4 (Tests-Rolle) ist das letzte Partial.

## Partial Plans

- [p1] `tasks.d/p1-datenebene.md` — Stil-Datenbank-Dateien: JSON-Schema + 2 Beispiel-Einträge
- [p2] `tasks.d/p2-beitragspfad.md` — Verzeichnis/Index + README mit D14-Beitragsregeln
- [p3] `tasks.d/p3-zugriff.md` — Adapter `data.styles()` + Daemon-Route `GET /api/cockpit/styles`
- [p4] `tasks.d/p4-tests.md` — BATS (Schema, D14, Route) + Vitest (Adapter, D13)

## Quality Gates

- `bash scripts/plan-lint.sh openspec/changes/k9-stil-datenbank/tasks.md`
- `bash scripts/openspec.sh validate`
- BATS-Negativtests mit Positiv-Anker (T002356-M1)
- Kein Panel ruft `fetch()` direkt — nur Adapter-Methoden (E1)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Tests-Partial (p4) fügt zuerst den BATS-Test
      hinzu, der das JSON-Schema und die D14-Token-Bezüge prüft und auf dem
      aktuellen Branch FAILEN muss (`expected: FAIL` in tasks.d/p4-tests.md).
- [ ] **Fix-Step (GREEN).** p1–p3 implementieren Datenebene, Beitragspfad und
      Zugriff; die BATS-/Vitest-Tests aus p4 müssen danach passen.
- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Blockiert

K2 (T002461): `daemon/server.ts` (Daemon-Route p3) existiert erst nach K2-Merge (PR #3553). Der Branch wird nach K2-Merge auf main rebased, bevor p3 dispatched wird.
