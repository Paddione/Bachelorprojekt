---
title: "local-llm-proxy — Implementation Plan"
ticket_id: T002081
domains: [factory, website, infra, db]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# local-llm-proxy — Implementation Plan

_Ticket: T002081 · Design: `openspec/changes/local-llm-proxy/design.md` · Partial-Modus (T002074)_

Repo-verwalteter lokaler LLM-Proxy (Port 18235) als alleiniges Gateway für llama.cpp, LM Studio,
DeepSeek und Opencode Go — mit dynamischer `/v1/models`-Discovery, Verfügbarkeits-Fallback und
GUI im Steuerung-Tab + Sidekick-Submenü. Details je Partial in `tasks.d/`.

## Partials

| id | file | role | target_files |
|----|------|------|--------------|
| p1-proxy | tasks.d/p1-proxy.md | impl | scripts/llm-proxy/server.mjs, scripts/llm-proxy/backends.mjs, scripts/llm-proxy/discovery.mjs, scripts/llm-proxy/fixups.mjs, scripts/migrations/2026-07-22-llm-proxy-backends.sql, scripts/factory/route-provider.sh, Taskfile.llm.yml |
| p2-gui | tasks.d/p2-gui.md | impl | website/src/lib/llm-proxy-db.ts, website/src/pages/api/admin/llm-proxy/backends.ts, website/src/pages/api/admin/llm-proxy/backends/[id].ts, website/src/pages/api/admin/llm-proxy/status.ts, website/src/pages/api/admin/llm-proxy/reload.ts, website/src/components/factory/LlmProxyPanel.svelte, website/src/components/assistant/LlmProxyView.svelte, website/src/components/DevStatusTabs.svelte, website/src/components/PortalSidekick.svelte, website/src/components/assistant/SidekickHome.svelte |
| p3-tests | tasks.d/p3-tests.md | tests | tests/spec/local-llm-proxy.bats, scripts/llm-proxy/server.test.mjs, website/src/lib/llm-proxy-db.test.ts, website/src/pages/api/admin/llm-proxy/status.test.ts |

## File Structure

```
scripts/llm-proxy/server.mjs                                  (neu — HTTP-Gateway :18235)
scripts/llm-proxy/backends.mjs                                (neu — DB-Registry-Loader)
scripts/llm-proxy/discovery.mjs                                (neu — /v1/models-Probe + Katalog)
scripts/llm-proxy/fixups.mjs                                   (neu — bonsai-system-role-fixup)
scripts/llm-proxy/server.test.mjs                              (neu — Unit-Tests Routing/Fixups)
scripts/migrations/2026-07-22-llm-proxy-backends.sql           (neu — Tabelle + Seed + Drift-Fix)
scripts/factory/route-provider.sh                              (mod — Opus-Hardcode → :18235)
Taskfile.llm.yml                                               (mod — llm:proxy:start|stop|status|logs)
website/src/lib/llm-proxy-db.ts                                (neu — DB-Layer)
website/src/lib/llm-proxy-db.test.ts                           (neu — Vitest)
website/src/pages/api/admin/llm-proxy/backends.ts              (neu — GET/POST)
website/src/pages/api/admin/llm-proxy/backends/[id].ts         (neu — PUT/DELETE)
website/src/pages/api/admin/llm-proxy/status.ts                (neu — offline-toleranter Status)
website/src/pages/api/admin/llm-proxy/status.test.ts           (neu — Vitest)
website/src/pages/api/admin/llm-proxy/reload.ts                (neu — POST reload)
website/src/components/factory/LlmProxyPanel.svelte            (neu — Steuerung-Tab-Panel)
website/src/components/assistant/LlmProxyView.svelte           (neu — Sidekick-Drawer-View)
website/src/components/DevStatusTabs.svelte                    (mod — Panel in control-extras)
website/src/components/PortalSidekick.svelte                   (mod — View-Zweig llm-proxy)
website/src/components/assistant/SidekickHome.svelte           (mod — Submenü-Eintrag)
tests/spec/local-llm-proxy.bats                                (neu — Spec-BATS)
```

## S1-Budgets (bestehende Dateien)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/factory/route-provider.sh` | 77 | 423 |
| `website/src/components/DevStatusTabs.svelte` | 328 | 172 |
| `website/src/components/PortalSidekick.svelte` | 551 | 27 |
| `website/src/components/assistant/SidekickHome.svelte` | 306 | 194 |

`PortalSidekick.svelte` ist gebaselined (578) — der neue View-Zweig bleibt ≤12 Zeilen; alle
Logik lebt in der neuen `LlmProxyView.svelte`. Neue Dateien planen strikt unter ihren
Extension-Limits (.svelte/.mjs 500, .ts 600).

## Ausführungsreihenfolge

1. **p3-tests** zuerst RED schreiben (Failing-Test-Step mit Runner — siehe Partial),
2. **p1-proxy** und **p2-gui** unabhängig (disjunkte Dateien, gang-fähig),
3. dann finaler Verify-Task unten (GREEN).

## Task F: Finale Verifikation (nach allen Partials)

- [ ] Alle Partial-Verify-Steps sind grün (BATS + Vitest aus p3 laufen GREEN).
- [ ] Test-Inventar nach Test-Neuanlagen regenerieren und committen:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] OpenSpec-Validierung:

```bash
task test:openspec
```

- [ ] CI-Äquivalenz-Gates (S1–S4-Ratchet inklusive):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Rollout (dokumentiert, manuell): Alt-Proxy auf `:18235` stoppen → `task llm:proxy:start` →
      Migration anwenden → `bash scripts/factory/route-provider.sh factory-implement sonnet`
      liefert `baseUrl` `http://127.0.0.1:18235`.
