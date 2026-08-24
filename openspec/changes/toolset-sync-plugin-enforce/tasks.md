---
title: "toolset-sync-plugin-enforce — Implementation Plan"
ticket_id: T014551
domains: [tools]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# toolset-sync-plugin-enforce — Implementation Plan

## Befund (verifiziert 2026-08-24, live)

- `scripts/toolset/sync.mjs:16` filtert ausschliesslich `instKey.startsWith('mcp:')` — alle
  `plugin:`-Entscheidungen der Registry werden beim Sync ignoriert.
- `scripts/toolset/check.mjs:127-149` vergleicht `plugin:`-Entscheidungen gegen
  `.claude/settings.json → enabledPlugins` und meldet aktuell **7 divergente Entscheidungen**
  als Advisory (rc=0): u.a. feature-dev/frontend-design/playwright/skill-creator/
  claude-code-setup/claude-md-management (registry=suppressed, settings=enabled) und
  learning-output-style (registry=canonical, settings=disabled).
- Folge: die Registry behauptet eine Kuration, die im Harness nicht wirkt (Enforceability-
  Klasse `partial`, Kommentar in check.mjs:2b).

## Zielbild

`sync.mjs` schreibt `plugin:`-Entscheidungen in `.claude/settings.json → enabledPlugins`
durch (`canonical → true`, `suppressed → false`) — dasselbe surgical tmp+rename-Muster wie
bei `disabledMcpjsonServers`. Das Advisory in check.mjs verschwindet, weil Sync und Check
dieselbe Quelle haben. Die Upgrade-Pfade in check.mjs (Kommentar 2b: "melden, nicht failen")
bleiben unveraendert — sie greifen nur, wenn kuenftige Klassen hinzukommen.

## File Structure

```
scripts/toolset/sync.mjs                                   plugin:-Sammlung + enabledPlugins-Durchschrieb (main ~90, Limit 400)
tests/spec/toolset-registry/sync-plugin-enforce.bats       (neu) Output-Verifikation mit Fixture-Registry + Fixture-Settings
```

## Partial-Manifest

Ein Partial. Fix und Test verteidigen dieselbe Funktion; ein Schnitt wuerde einen Sync
zuruecklassen, dessen Verhalten kein Test pinnt.

## Tasks

- [ ] **1. Failing test (RED).** `tests/spec/toolset-sync-plugin-enforce-T014551`-Fall in
      `tests/spec/toolset-registry/sync-plugin-enforce.bats`: Fixture-Registry (ein
      `plugin:fix@market: state canonical`, ein `plugin:sup@market: state suppressed`)
      + Fixture-`.claude/settings.json` in einem tmp-Dir; dann

      ```bash
      TOOLSET_REGISTRY=<fixture> TOOLSET_OUT_DIR=<tmp> node scripts/toolset/sync.mjs
      ```

      Output-Verifikation (tests/CLAUDE.md: Verhalten messen, nicht Source greppen):
      nach dem Lauf muss `enabledPlugins['fix@market'] === true` und
      `enabledPlugins['sup@market'] === false` in der Fixture-Settings stehen.

      expected: FAIL — sync.mjs schreibt heute keine enabledPlugins, beide Assertions rot.

- [ ] **2. Sync erweitern.** In `sync.mjs` neben `suppressedMcpServers` ein
      `pluginDecisions`-Map sammeln (`instKey.startsWith('plugin:')` → Slice als Key,
      `state === 'canonical'` als Wert) und im Claude-Settings-Block
      `settings.enabledPlugins[key] = value` fuer jede Registry-Entscheidung setzen.
      Surgical write beibehalten (tmp+rename), bestehende fremde Keys in enabledPlugins
      nicht anfassen.

- [ ] **3. GREEN + Live-Abgleich.**

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/sync-plugin-enforce.bats
      node scripts/toolset/sync.mjs && node scripts/toolset/check.mjs
      ```

      Erwartet: Test gruen; der Live-Lauf raeumt die 7 Advisories ab (check meldet keine
      "not enforced"-Zeile mehr) und bleibt rc=0. Danach die aktualisierte
      `.claude/settings.json` committen (sie ist generated-artifact-pflichtig — freshness).

- [ ] **4. Final Verification.**

      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: keine neuen Fehlschlaege gegenueber origin/main, freshness gruen.
