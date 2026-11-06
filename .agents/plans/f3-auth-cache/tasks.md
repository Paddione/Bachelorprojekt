---
title: "f3-auth-cache — getSession/isAdmin-Fan-in hinter getSessionWithResolver + Request-Cache konsolidieren"
domains: [website]
status: staged
goal: od1-website-sink
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# f3-auth-cache — Implementation Plan

Zweck: F3-Follow-up zur W2-A-Auth-Extraktion (`components/website/src/lib/auth.ts`,
Seams `SessionResolver`/`AdminPolicy`, Commit `c8728c687` Refactor+Cache):
Den `getSession`/`isAdmin`-Fan-in (~500 Call-Sites, fast nur
`pages.api.admin.*`- + `pages.sdlc.api.*`-Guards) hinter den vorhandenen
`getSessionWithResolver`-Injektionspunkt (`auth.ts:406-411`) führen und den
per-request Session-Cache (`auth.ts:349-399`) konsolidieren — ohne
Verhaltensänderung (reine Call-Site-Umleitung + Cache-Vereinheitlichung,
Fail-closed bleibt: Resolver-Fehler → `null`, Negative nie cachen).

Endzustand: alle `getSession`-Caller laufen über EINE `resolveSession`-Bahn
(`useCache`-Pfad wählbar, Default `getSession` = cached, Injektionspunkt =
unkached/fake-fähig); `isAdmin` läuft über genau EINE Policy-Instanz-Bahn
(`DefaultAdminPolicy`, injizierbar); `clearSessionCache`-Semantik
unverändert; Gate-Tests grün.

## Bestand (lesend erhoben, 2026-11-06, HEAD `f0e00b7ff`)

| Symbol | Datei:Zeilen | Signatur / Rolle |
|---|---|---|
| `DefaultAdminPolicy.isAdmin` | `components/website/src/lib/auth.ts:275` | einziger Callee von `isAdmin` |
| `isAdmin` | `:287-289` | `export function isAdmin(session: UserSession): boolean`, ~457-470 Caller |
| `DbSessionResolver` | `:291-345` | `SessionResolver`-Impl (einziger Prod-Caller von `resolveSession` via Default) |
| `clearSessionCache` | `:366` | `export function clearSessionCache(sessionId?: string): void` |
| `resolveSession` | `:371-399` | interne Bahn (`cookieHeader, resolver, useCache`) |
| `getSession` | `:401-403` | `export async function getSession(cookieHeader: string\|null): Promise<UserSession\|null>`, ~496-509 Caller |
| `getSessionWithResolver` | `:406-411` | Injektionspunkt (`useCache=false`), Ziel-Bahn für Fan-in |

Churn 6 Monate: 4 Commits (`c8728c687` Refactor+Cache 2026-11-06, `9ea7afa7b`,
`a92547424`, `de4c5be7c` Bulk-Reorg 2026-08-15) — aktuell ruhig, kein
Konfliktfeld. Caller fast nur `pages.api.admin.*` + `pages.sdlc.api.*`
Guards; keine externen Callees außer `resolveSession`/Policy.

STOP-Regel: Weicht der p0-Fan-in-Count wild vom Bestand ab (> ±25 % ggü.
~500 `getSession`- / ~460 `isAdmin`-Referenzen), Stufen neu gruppieren und
an Primary zurückgeben — nicht still rescopen.

## File Structure

| Datei | Ist | Status |
|---|---|---|
| `components/website/src/lib/auth.ts` | ~470 Zeilen | ändern (NUR p1: Cache-Bahn + Injektionspunkt, keine Signaturbrüche) |
| `components/website/src/pages/api/admin/**` + `pages/sdlc/api/**` | Guards | ändern (p1: `getSession`→Bahn, nur wo nötig; rein mechanisch) |
| `components/website/src/lib/auth.test.ts` | 485 Zeilen | LESEN + Gate (p0-Baseline, p2-Gate); erweitern nur falls Lücke |
| Admin-Routen-Tests (Liste in p2) | — | Gates (p2), NICHT ändern |
| `.agents/plans/f3-auth-cache/phase-events.log` | 0 (neu) | neu (Beleg-Artefakt: Counts + Testergebnisse) |

Full-Suite läuft explizit NICHT (Scope-Gate: nur unten gelistete Tests).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p0 | tasks.d/p0-baseline.md | tests | `auth.ts` (lesen), `auth.test.ts` (lesen) | |
| p1 | tasks.d/p1-cache-fanin.md | impl | `components/website/src/lib/auth.ts`, Admin-/SDLC-Guards | p0 |
| p2 | tasks.d/p2-verify.md | tests | Gate-Testliste (s. p2), `phase-events.log` | p1 |

## Tasks

- [x] **0. Partial p0** (`tasks.d/p0-baseline.md`): Fan-in-Baseline + Gate-Tests grün VOR Änderung belegen.
- [x] **1. Partial p1** (`tasks.d/p1-cache-fanin.md`): Cache-Bahn konsolidieren + Fan-in umleiten (mechanisch, keine Signaturbrüche).
- [x] **2. Partial p2** (`tasks.d/p2-verify.md`): Blast-Radius-Gate (`auth.test.ts` + ~20 Admin-Routen-Tests) grün + Rollback-Notiz.
