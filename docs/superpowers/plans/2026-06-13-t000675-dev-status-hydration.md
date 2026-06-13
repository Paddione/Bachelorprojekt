---
ticket_id: T000675
plan_ref: docs/superpowers/plans/2026-06-13-t000675-dev-status-hydration.md
status: active
date: 2026-06-13
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: T000675 — /dev-status JS-Hydration-Regression beheben

## Kontext

Seit Commit `ce033472` (2026-06-10, PR #1547 Analytics Dashboard) und Commit `6bb0d819`
(2026-06-11, PR #1579 DependencyGraph) enthält `DevStatusTabs.svelte` fünf `client:load`
Attribute auf Svelte-Kind-Komponenten (Zeilen 117–120 und 124). Diese Astro-Island-Direktive
ist **nur in `.astro`-Dateien gültig**. Im Svelte-Kontext wird sie als unbekanntes Prop
weitergereicht, was in Svelte 5 zu einem Hydrations-Fehler führt — der gesamte
Event-Listener-Baum der Parent-Komponente `DevStatusTabs` wird nicht gebunden. Resultat:
alle `onclick`-Handler sind tot, keine Tab-Wechsel, keine URL-Updates, kein floor-detail.

Das Parent `<DevStatusTabs client:load />` in `dev-status.astro` reicht für die vollständige
Hydration aller Kind-Svelte-Komponenten aus — keine weiteren `client:load` nötig.

## Root Cause

```
DevStatusTabs.svelte:117  <FactoryKpiGrid client:load />        ← INVALID in Svelte
DevStatusTabs.svelte:118  <FactoryThroughputChart client:load /> ← INVALID in Svelte
DevStatusTabs.svelte:119  <FactoryPhaseHeatmap client:load />   ← INVALID in Svelte
DevStatusTabs.svelte:120  <FactoryShippedBar client:load />     ← INVALID in Svelte
DevStatusTabs.svelte:124  <DependencyGraph client:load />       ← INVALID in Svelte
```

## Failing Tests (bereits rot auf Live/CI)

- `FA-UNIF-02`: `?tab=planung` — `.ds-tab.active` enthält nicht 'Planungsbüro'
- `FA-UNIF-03`: Tab-Klick ändert URL nicht
- `FA-UNIF-07`: Mobile Tab-Klick funktioniert nicht
- `fa-factory-floor`/`fa-factory-injection`: floor-workpiece click → floor-detail nicht sichtbar

## Implementierungsschritte

### Task 1 — Invalid `client:load` entfernen

**Datei:** `website/src/components/DevStatusTabs.svelte` (195 Zeilen, S1 Budget: ~500, kein Split nötig)

Ersetze in den Analytics/Deps-Tabs:

```svelte
<!-- VORHER (Zeilen 116–125) -->
{:else if activeTab === 'analytics'}
  <div class="analytics-tab-wrap">
    <FactoryKpiGrid client:load />
    <FactoryThroughputChart client:load />
    <FactoryPhaseHeatmap client:load />
    <FactoryShippedBar client:load />
  </div>
{:else if activeTab === 'abhaengigkeiten'}
  <div class="dag-tab-wrap">
    <DependencyGraph client:load />
  </div>

<!-- NACHHER -->
{:else if activeTab === 'analytics'}
  <div class="analytics-tab-wrap">
    <FactoryKpiGrid />
    <FactoryThroughputChart />
    <FactoryPhaseHeatmap />
    <FactoryShippedBar />
  </div>
{:else if activeTab === 'abhaengigkeiten'}
  <div class="dag-tab-wrap">
    <DependencyGraph />
  </div>
```

Das Parent in `dev-status.astro` behält `<DevStatusTabs client:load ... />` — keine Änderung dort.

### Task 2 — Typecheck

```bash
cd website && pnpm typecheck
```

Stellt sicher, dass keine TypeScript-Fehler eingeführt wurden.

### Task 3 — Verifikation (CI-Äquivalent)

```bash
task test:all
task freshness:regenerate
task freshness:check
```

### Task 4 — Commit & PR

```bash
git add website/src/components/DevStatusTabs.svelte
git commit -m "fix(website): remove invalid client:load from Svelte child components [T000675]"
git push -u origin fix/t000675-dev-status-hydration
gh pr create --title "fix(website): remove invalid client:load directives — restore /dev-status JS hydration [T000675]" \
  --body "$(cat <<'EOF'
## Summary
- Removes 5 invalid `client:load` Astro directives from Svelte child components in DevStatusTabs.svelte
- `client:load` is Astro-only; in Svelte context it causes a hydration error that silently deactivates all event listeners
- The parent `<DevStatusTabs client:load />` in dev-status.astro already handles full hydration
- Restores: tab clicks, URL updates, floor-detail, mobile tab switching

## Root cause
Commits ce033472 (PR #1547) + 6bb0d819 (PR #1579) added `client:load` on FactoryKpiGrid, FactoryThroughputChart, FactoryPhaseHeatmap, FactoryShippedBar, DependencyGraph — all Svelte components rendered inside another Svelte component.

## Tests fixed
- FA-UNIF-02, FA-UNIF-03, FA-UNIF-07 (dev-status-tabs.spec.ts)
- fa-factory-floor, fa-factory-injection (floor-workpiece → floor-detail)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --auto
```

## Nicht im Scope

- localStorage-Override in `onMount` (FA-UNIF-10 beobachtet; kein funktionaler Bug, kein Test-Fehler)
- `/api/admin/qa-queue` 500 (bereits durch PR #1629 gefixt)
- Planungsbüro Tab 30s Timeout: wird durch Hydrations-Fix mitbehoben (Hydration blockierte load-Event)
