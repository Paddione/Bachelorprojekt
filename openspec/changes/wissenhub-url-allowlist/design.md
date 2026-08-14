---
ticket_id: T005901
plan_ref: openspec/changes/wissenhub-url-allowlist/tasks.md
status: active
date: 2026-08-14
---

# Design: WissenHub — http(s)-Allowlist für crawl_config.startUrl

## Root-Cause (Security-Review-Befund, 2026-08-14)

`website/src/components/admin/WissenHub.svelte:172-173` rendert `crawl_config.startUrl` als `href` ohne Scheme-Prüfung — ein `javascript:`-Wert (vom Server als gültige URL akzeptiert, `new URL()` parst ihn) führt beim Klick Code im Admin-Panel-Kontext aus. Server-Endpoint `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts:25` validiert nur Parsbarkeit, nicht das Protokoll.

## Entscheidung

Ein geteilter, reiner Helper als Single Source of Truth für die Scheme-Semantik; `new URL`-Basics (Parsbarkeit) bleiben durch den Helper abgedeckt.

**Konfliktlage T005900 (2026-08-14, nach Planerstellung):** Der automatische Security-Review hat dieselbe Lücke als T005900 erfasst; dessen Fix wurde auf `main` gemergt und etabliert dort `website/src/lib/safe-url.ts` (`safeHttpUrl(value: unknown): string | null`) als Helper inkl. `safe-url.test.ts`. T005901 konsolidiert darauf statt eine zweite Helper-Datei (`knowledge-url.ts`) einzuführen:

- **Server:** PATCH-Validierung nutzt `safeHttpUrl` → Nicht-http(s) = 400 (`startUrl muss eine http(s)-URL sein`).
- **Client:** Link nur rendern, wenn `safeHttpUrl(url)` einen Wert liefert — sonst reiner Text (kein `<a>`).

## Teststrategie (Rot-Grün)

- Helper-Tests (http/https akzeptiert, javascript:/data:/ftp:/file: abgelehnt, Unparsebares abgelehnt) deckt auf main bereits `website/src/lib/safe-url.test.ts` ab.
- `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts` (rot bestätigt, dann grün): vi.mock auf auth + knowledge-db; PATCH mit `javascript:alert(1)` → 400; `https://…` → 200. Mock-Pfade waren um eine Ebene zu tief (`'../../../../../../../lib/…'` statt 6 Ebenen) und die `PATCH`-Aufrufe brauchten den `APIContext`-Cast nach Repo-Konvention (`as unknown as Parameters<typeof PATCH>[0]`).

Vitest lokal im Worktree: `cd website && pnpm install --frozen-lockfile && pnpm exec vitest run <pfade>` — frische Worktrees haben kein node_modules-Symlink-Problem (T002239-M3 betrifft nur vom worktree-create.sh gespiegelte Bäume).

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `website/src/lib/safe-url.ts` | existiert auf main (T005900) — SSOT-Helper, von T005901 konsumiert |
| `website/src/lib/knowledge-url.ts` | verworfen (Duplikat zu safe-url.ts, im Branch gelöscht) |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts` | Validierung nutzt `safeHttpUrl` statt Inline-Prüfung |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts` | neu (rot → grün) |
| `website/src/components/admin/WissenHub.svelte` | `{#if safeHttpUrl(url)}` um den Link (main-Version übernommen) |

Kein Datenbestand-Check in diesem Fix (separat — siehe Ticket).
