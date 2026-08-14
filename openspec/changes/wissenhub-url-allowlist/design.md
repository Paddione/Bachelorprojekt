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

Ein geteilter, reiner Helper `website/src/lib/knowledge-url.ts`:

```ts
export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
```

- **Server:** PATCH-Validierung ersetzt die Parsbarkeits-Prüfung durch `isValidHttpUrl` → Nicht-http(s) = 400 (`startUrl muss http(s) sein`).
- **Client:** Link nur rendern, wenn `isValidHttpUrl(url)` — sonst reiner Text (kein `<a>`).

Single Source of Truth für die Scheme-Semantik; `new URL`-Basics (Parsbarkeit) bleiben durch den Helper abgedeckt.

## Teststrategie (Rot-Grün)

- `website/src/lib/knowledge-url.test.ts` (rot: Modul fehlt — ERR_MODULE_NOT_FOUND bestätigt): http/https akzeptiert, javascript:/data:/ftp:/file: abgelehnt, Unparsebares abgelehnt.
- `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts` (rot): vi.mock auf auth + knowledge-db; PATCH mit `javascript:alert(1)` → 400; `https://…` → 200.

Vitest lokal im Worktree: `cd website && pnpm install --frozen-lockfile && pnpm exec vitest run <pfade>` — frische Worktrees haben kein node_modules-Symlink-Problem (T002239-M3 betrifft nur vom worktree-create.sh gespiegelte Bäume).

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `website/src/lib/knowledge-url.ts` | neu (Helper) |
| `website/src/lib/knowledge-url.test.ts` | neu (rot) |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts` | Validierung nutzt Helper |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.test.ts` | neu (rot) |
| `website/src/components/admin/WissenHub.svelte` | `{#if isValidHttpUrl(url)}` um den Link |

Kein Datenbestand-Check in diesem Fix (separat — siehe Ticket).
