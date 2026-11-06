# p1 — Cache-Bahn konsolidieren + Fan-in umleiten (Impl, nach p0)

## Ziel
EINE `resolveSession`-Bahn für alle Caller; `getSessionWithResolver` wird der
einzige Injektions-/Fake-Punkt; `isAdmin` läuft über genau eine
Policy-Bahn. Keine Signaturbrüche, kein Verhaltenswechsel.

## Exakte Interfaces (unverändert, nur intern verdrahten)
- `export async function getSession(cookieHeader: string|null): Promise<UserSession|null>`
  → `resolveSession(cookieHeader, defaultSessionResolver, true)` (bleibt).
- `export async function getSessionWithResolver(cookieHeader: string|null, resolver: SessionResolver): Promise<UserSession|null>`
  → bleibt Fake-Punkt; prüft p1, ob ein optionaler `useCache`-/`options`-Param
  nötig ist, damit Admin-Guards bewusst cached auflösen können — Default
  `false` (injizierte Fakes dürfen NIE aus dem Prod-Cache bedient werden).
- `export function isAdmin(session: UserSession): boolean`
  → delegiert an EINE Modul-Instanz (`defaultAdminPolicy`); optionaler
  `AdminPolicy`-Param nur falls ein Guard-Seam ihn braucht (sonst NICHT
  einführen — kein Over-Engineering).
- `export function clearSessionCache(sessionId?: string): void` — Semantik
  unverändert (mit Id → ein Eintrag, ohne → alles).

## Schritte
1. `auth.ts` (`:371-411`): Cache-Entscheidung an genau EINER Stelle
   (`resolveSession`); keine zweite Cache-Bahn neben `getSession`;
   Kommentar-Block (`:349-354`) auf Endzustand aktualisieren.
2. Guards (`pages/api/admin/**`, `pages/sdlc/api/**`): nur mechanisch auf die
   Bahn führen, wo sie heute an `resolveSession`/`DbSessionResolver` vorbei
   arbeiten; reine `getSession`+`isAdmin`-Caller UNVERÄNDERT lassen
   (kein Churn ohne Nutzen).
3. Token-Refresh-Pfad (`DbSessionResolver.resolve`, `:314-337`) unangetastet;
   nach Refresh geschriebenes `session`-Objekt ist zugleich das gecachte
   (kein stale-write: `sessionCache.set` erst nach erfolgreichem DB-Update).

## Gates (p1Done)
- `rg -n "new DbSessionResolver|resolveSession\(" components/website/src --type ts -g '!*.test.*'`
  zeigt nur noch die EINEN kanonischen Stellen (auth.ts-intern + Default).
- `auth.test.ts` lokal grün (schneller Rauchtest, volles Gate erst p2).
- Verbotene Abkürzung: KEIN `sessionCache.clear()` als Ersatz für gezielte
  Eviction; KEIN Cachen von `null`/Fehlerpfaden (Fail-closed).

## Erwartung (kein Fix)
Diff klein (< 100 Zeilen Prod-Code); die meisten der ~500 Call-Sites ändern
sich NICHT (sie nutzen bereits `getSession`/`isAdmin`).
