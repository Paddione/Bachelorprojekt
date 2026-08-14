---
title: Safe http/https-only URL rendering in WissenHub
ticket_id: T005900
domains: [website, test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Safe http/https-only URL rendering in WissenHub — Implementation Plan

`WissenHub.svelte` rendert `crawl_config.startUrl` ungeprüft in `<a href>` (Z. 172-173) —
ein `javascript:`-Wert ist ein Stored-XSS-Vektor. Die Persist-API prüft nur URL-Parsbarkeit,
nicht das Protokoll (`new URL('javascript:alert(1)')` ist valide). Fix an beiden Enden:
`safeHttpUrl`-Helper + Render-Guard (Client) und http/https-Only in der crawl-config-API
(Server).

## File Structure

- `website/src/lib/safe-url.ts` — Helper (Task 2)
- `website/src/lib/safe-url.test.ts` — Vitest-Cases (Task 1, RED)
- `website/src/components/admin/WissenHub.svelte` — Render-Guard (Task 2)
- `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts` — API-Guard (Task 3)

## Task 1 — RED: Test-Cases schreiben und rot nachweisen

1. `website/src/lib/safe-url.test.ts` anlegen (6 Cases: https/http → href; javascript:/data:/
   Nicht-URL/non-string → null).
2. Rot nachweisen: Der Import `./safe-url` schlägt fehl (Modul existiert nicht) — lokaler
   Beleg über den dokumentierten Workaround (Website-Vitest ist lokal nicht lauffähig,
   Memory „website-vitest-not-runnable-locally"):
   `node --experimental-strip-types -e "import('./website/src/lib/safe-url.ts')"` →
   ERR_MODULE_NOT_FOUND (`expected: FAIL`). Der vollständige RED-Beweis läuft im
   CI-Job „Vitest (website)". T003548-Wächter: der Test darf am Ende nicht skip/green-by-
   absence sein — in der GREEN-Phase muss der CI-Vitest-Job real grün werden.

## Task 2 — GREEN: Helper + Render-Guard

1. `website/src/lib/safe-url.ts`: `export function safeHttpUrl(value: unknown): string | null`
   — bei string: `new URL(value)` parsen, nur `http:`/`https:` → `u.href`, sonst/bei
   Parse-Fehler `null`; bei non-string `null`.
2. `WissenHub.svelte`: `{@const url = safeHttpUrl(col.crawl_config?.startUrl)}` — Anker nur
   rendern wenn `url` nicht null; `rel="noopener noreferrer"`; bei null den Wert als
   Plain-Text ausgeben (kein Pseudolink, kein Silent-Drop).

## Task 3 — API-Guard in crawl-config.ts

Nach dem bestehenden `new URL()`-Check (Z. 25) das Protokoll prüfen: nur `http:`/`https:`
akzeptieren, sonst 400 (`startUrl muss http/https sein`) — nichts persistieren. Falls die
API bereits getestet wird, einen Case für das javascript:-Schema ergänzen.

## Task 4 — Verifikation

- Vitest-Cases via CI-Job „Vitest (website)" real grün (lokal der strip-types-Smoke auf den
  Helper).
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate wissenhub-safe-url`
