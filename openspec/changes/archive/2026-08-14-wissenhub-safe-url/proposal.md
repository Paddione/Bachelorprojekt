# Proposal: wissenhub-safe-url

## Purpose (deutsch)

Der automatische Security-Review (security-guidance, 2026-08-14) meldete einen
Stored-XSS-Vektor: `WissenHub.svelte` rendert `col.crawl_config.startUrl` ungeprüft in einen
`<a href>` (Z. 172-173) — ein `javascript:`-Wert würde beim Klick im Admin-Kontext ausgeführt.
Die Persist-API (`api/admin/knowledge/collections/[id]/crawl-config.ts`) validiert `startUrl`
zwar per `new URL()` (Z. 25), aber `javascript:alert(1)` parst als gültige URL — der
Schema-Check fehlt genau dort. Der Setter braucht Admin-Rechte, der Vektor ist also
admin-intern, aber real (T005900).

Dieser Change schließt den Vektor an beiden Enden: (1) Render-Guard — ein `safeHttpUrl`-Helper
gibt nur `http:`/`https:`-URLs als href zurück, alles andere wird als Text/nicht gerendert
(plus `rel="noopener noreferrer"`); (2) Persist-Guard — die crawl-config-API erzwingt dasselbe
http/https-Only beim Speichern (400 bei anderen Schemata).

## Goals

- `safeHttpUrl`-Helper (pure TS-Funktion, testbar ohne Browser) in einer Lib-Datei; Verhalten:
  `https://…`/`http://…` → href; `javascript:…`, `data:…`, Nicht-URLs → null.
- `WissenHub.svelte` rendert den Crawl-Link nur, wenn der Helper einen Wert liefert
  (Fallback: reiner Text), mit `rel="noopener noreferrer"`.
- `crawl-config.ts`-API: nach dem bestehenden `new URL()`-Check zusätzlich das Protokoll
  prüfen — `javascript:`/`data:`/sonstiges → 400, nichts wird persistiert.
- Vitest-Case `safe-url.test.ts` (RED vor der Implementierung) + API-Validierung im
  bestehenden Test-Muster, falls die crawl-config-API bereits getestet wird.

## Non-Goals

- Kein generelles URL-Sanitizing über die Website hinaus (andere Render-Stellen sind
  separat zu prüfen).
- Keine Änderung des Crawl-Verhaltens selbst.
- Kein Refactoring der Auth-/Callback-Prüfung (`api/auth/callback.ts:46` bleibt, wird nur
  als bestehendes Protokoll-Prüfmuster zitiert).

## Symptom vs. Ursache (T002448-M5)

- **Symptom (Scanner):** user-controlled URL wird ohne Scheme-Allowlist in href gerendert.
- **Ursache (am Code verifiziert):** (a) Render-Seite hat keinen Guard (WissenHub.svelte:172-173);
  (b) der Persist-Check prüft nur URL-Parsbarkeit, nicht das Protokoll
  (crawl-config.ts:25) — `new URL('javascript:alert(1)')` ist valide. Beide Stellen sind
  oben zitiert; der RED-Test reproduziert die Helper-Lücke, der API-Test die Schema-Lücke.

## Design-Entscheidungen

1. **Helper als pure Funktion in einer Lib-Datei** (`website/src/lib/safe-url.ts`) statt in
   der Komponente: testbar ohne Svelte-Runtime, wiederverwendbar für künftige Render-Stellen.
2. **Null statt Fallback-URL:** Der Helper gibt `null` für Nicht-http/https zurück; die
   Komponente rendert dann den Text ohne Anker — kein Pseudolink, kein Silent-Drop des
   Werts.
3. **Server-Validierung zusätzlich zum Client-Guard:** Der Client-Guard schützt die
   Darstellung, der API-Guard verhindert die Persistenz — beide Seiten, wie vom Scanner
   gefordert.
