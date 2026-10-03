---
title: "svelte-check-zero — Implementation Plan"
ticket_id: T900809
domains: [website, ci, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# svelte-check-zero — Implementation Plan

`svelte-check` meldet 85 Fehler in 37 Svelte-Komponenten, weil CI nur `astro check` ausführt und
das keine `.svelte`-Dateien prüft. p1 macht `svelte-check` zum blockierenden CI-Schritt, p2–p6
bringen die Fehler auf 0. Ursache, Beleg und Entscheidungen D1–D5: `design.md`.

_Ticket: T900809_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `.github/workflows/ci.yml` | 1031 | n/a (S1-ungated) |
| `components/website/package.json` | 84 | n/a (S1-ungated) |
| `components/website/pnpm-lock.yaml` | generiert | n/a (S1-ungated) |
| `components/website/src/components/sdlc/FactoryFloor.svelte` | 329 | 771 |
| `components/website/src/components/sdlc/factory/ControlPanel.svelte` | 182 | 918 |
| `components/website/src/components/sdlc/factory/ConveyorBelt.svelte` | 228 | 872 |
| `components/website/src/components/sdlc/factory/KiRoutingPanel.svelte` | 549 | 551 |
| `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte` | 180 | 920 |
| `components/website/src/components/leitstand/LeitstandStatusband.svelte` | 238 | 862 |
| `components/website/src/lib/factory-floor-types.ts` | 119 | 781 |
| `components/website/src/components/admin/AppCatalog.svelte` | 224 | 876 |
| `components/website/src/components/admin/ArchitekturGraph.svelte` | 224 | 876 |
| `components/website/src/components/admin/AssetGallery.svelte` | 204 | 896 |
| `components/website/src/components/admin/BulkToast.svelte` | 167 | 933 |
| `components/website/src/components/admin/DraftsInbox.svelte` | 282 | 818 |
| `components/website/src/components/admin/InhalteEditor.svelte` | 320 | 780 |
| `components/website/src/components/admin/PublishEditor.svelte` | 188 | 912 |
| `components/website/src/components/admin/TaxMonitorWidget.svelte` | 51 | 1049 |
| `components/website/src/components/admin/WissenHub.svelte` | 377 | 723 |
| `components/website/src/components/admin/inhalte/AngeboteSection.svelte` | 258 | 842 |
| `components/website/src/components/admin/platform/SoftwareTab.svelte` | 175 | 925 |
| `components/website/src/components/admin/graph/GraphCanvas.svelte` | 213 | 887 |
| `components/website/src/components/admin/aktionen/BackupsTab.svelte` | 124 | 976 |
| `components/website/src/components/admin/aktionen/KnowledgeTab.svelte` | 86 | 1014 |
| `components/website/src/components/admin/aktionen/ReleasesTab.svelte` | 71 | 1029 |
| `components/website/src/components/admin/aktionen/UsersTab.svelte` | 120 | 980 |
| `components/website/src/components/assistant/LlmProxyView.svelte` | 72 | 1028 |
| `components/website/src/components/assistant/LogsSidekickView.svelte` | 196 | 904 |
| `components/website/src/components/assistant/SidekickHome.svelte` | 307 | 793 |
| `components/website/src/components/inbox/InboxApp.svelte` | 1001 | 99 |
| `components/website/src/components/portal/InlineInvoicePayment.svelte` | 148 | 952 |
| `components/website/src/components/portal/WorkflowStatusMinimap.svelte` | 99 | 1001 |
| `components/website/src/components/BookingForm.svelte` | 560 | 540 |
| `components/website/src/components/ContactHub.svelte` | 318 | 782 |
| `components/website/src/components/MediaviewerPanel.svelte` | 228 | 872 |
| `components/website/src/components/PlanningOffice.svelte` | 448 | 652 |
| `components/website/src/components/PlanningOfficeItem.svelte` | 85 | 1015 |
| `components/website/src/components/WhyMe.svelte` | 223 | 877 |
| `components/website/src/components/sessions/SessionsHistory.svelte` | 334 | 766 |
| `components/website/src/lib/sessions/archive.ts` | 246 | 654 |
| `components/website/src/components/live/shared/ScheduleNudge.svelte` | 24 (wird gelöscht) | n/a |
| `components/website/src/components/live/stream/PollOverlayPanel.svelte` | 61 (wird gelöscht) | n/a |
| `tests/spec/website-svelte-check.bats` | 30 (neu, Failing Test) | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <datei>`.

<!-- vitest: kein neuer Test nötig, weil die Änderungen Typkorrekturen in Svelte-Komponenten und reine Typdeklarationen in src/lib sind; die Regression deckt tests/spec/website-svelte-check.bats über die svelte-check-Ausgabe ab -->

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-gate.md | impl | .github/workflows/ci.yml, components/website/package.json, components/website/pnpm-lock.yaml | |
| p2 | tasks.d/p2-sdlc.md | impl | components/website/src/components/sdlc/FactoryFloor.svelte, components/website/src/components/sdlc/factory/ControlPanel.svelte, components/website/src/components/sdlc/factory/ConveyorBelt.svelte, components/website/src/components/sdlc/factory/KiRoutingPanel.svelte, components/website/src/components/sdlc/factory/LlmProxyPanel.svelte, components/website/src/components/leitstand/LeitstandStatusband.svelte, components/website/src/lib/factory-floor-types.ts | p1 |
| p3 | tasks.d/p3-admin-core.md | impl | components/website/src/components/admin/AppCatalog.svelte, components/website/src/components/admin/ArchitekturGraph.svelte, components/website/src/components/admin/AssetGallery.svelte, components/website/src/components/admin/BulkToast.svelte, components/website/src/components/admin/DraftsInbox.svelte, components/website/src/components/admin/InhalteEditor.svelte, components/website/src/components/admin/PublishEditor.svelte, components/website/src/components/admin/TaxMonitorWidget.svelte | p1 |
| p4 | tasks.d/p4-admin-rest.md | impl | components/website/src/components/admin/WissenHub.svelte, components/website/src/components/admin/inhalte/AngeboteSection.svelte, components/website/src/components/admin/platform/SoftwareTab.svelte, components/website/src/components/admin/graph/GraphCanvas.svelte, components/website/src/components/admin/aktionen/BackupsTab.svelte, components/website/src/components/admin/aktionen/KnowledgeTab.svelte, components/website/src/components/admin/aktionen/ReleasesTab.svelte, components/website/src/components/admin/aktionen/UsersTab.svelte | p1 |
| p5 | tasks.d/p5-assistant-portal.md | impl | components/website/src/components/assistant/LlmProxyView.svelte, components/website/src/components/assistant/LogsSidekickView.svelte, components/website/src/components/assistant/SidekickHome.svelte, components/website/src/components/inbox/InboxApp.svelte, components/website/src/components/portal/InlineInvoicePayment.svelte, components/website/src/components/portal/WorkflowStatusMinimap.svelte | p1 |
| p6 | tasks.d/p6-root-sessions.md | impl | components/website/src/components/BookingForm.svelte, components/website/src/components/ContactHub.svelte, components/website/src/components/MediaviewerPanel.svelte, components/website/src/components/PlanningOffice.svelte, components/website/src/components/PlanningOfficeItem.svelte, components/website/src/components/WhyMe.svelte, components/website/src/components/sessions/SessionsHistory.svelte, components/website/src/lib/sessions/archive.ts, components/website/src/components/live/shared/ScheduleNudge.svelte, components/website/src/components/live/stream/PollOverlayPanel.svelte | p1 |
| p7 | tasks.d/p7-tests.md | tests | tests/spec/website-svelte-check.bats | p1, p2, p3, p4, p5, p6 |

## Gemeinsame Fix-Regeln für p2–p6

1. Nur die Dateien aus `target_files` des eigenen Partials ändern. Braucht ein Fix eine Datei
   außerhalb, den Fehler nicht umgehen, sondern im Partial-Ergebnis als offen melden.
2. Für jeden Fehler zuerst die Zeile lesen und entscheiden: Laufzeitdefekt (falscher Feldname,
   fehlendes Prop, nicht existierende Methode, falscher Enum-Wert) → Verhalten korrigieren.
   Reiner Typfehler → Typ korrigieren, Verhalten unverändert.
3. Verboten: neue `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `// @ts-nocheck`.
4. Nach den Fixes pro Partial:
   ```bash
   cd components/website && ./node_modules/.bin/svelte-check --threshold error --output machine \
     | grep ' ERROR ' | grep -E '<pfad-muster der eigenen target_files>'
   ```
   Ausgabe muss leer sein.

## Task: Failing Test bestätigen

```bash
bats tests/spec/website-svelte-check.bats
```

expected: FAIL. Test 2 schlägt fehl (kein svelte-check im CI-Job). Test 1 wird übersprungen,
bis p1 `svelte-check` installiert, und schlägt danach bis zum Ende von p6 fehl.

## Task: Finale Verifikation

```bash
cd components/website && ./node_modules/.bin/svelte-check --threshold error   # 0 errors
cd components/website && ./node_modules/.bin/astro check                        # 0 errors
bats tests/spec/website-svelte-check.bats                                       # 2/2 ok
bats tests/spec/g-cq02-any-types.bats
task test:changed
task freshness:regenerate
task freshness:check
```
