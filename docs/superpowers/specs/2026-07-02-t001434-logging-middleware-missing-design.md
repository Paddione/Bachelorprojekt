---
ticket_id: T001434
plan_ref: null
status: active
date: 2026-07-02
---

# Design: Logging-Middleware in `middleware.ts` einbinden (T001434)

**Ticket:** T001434
**Branch (vorgesehen):** `fix/t001434-logging-middleware-missing`
**Worktree:** `/tmp/wt-t001434-logging-middleware`
**Komplexität:** small (1-zeiliger Import + 1 Zeile Umbau in `middleware.ts`,
                  neuer Vitest-Test in `website/src/middleware/middleware.test.ts`)
**SSOT-Spec:** `openspec/specs/centralized-logging.md` (existiert — der
              Requirement-Block "X-Request-ID injection and request lifecycle
              logging" ist bereits SSOT, hier geht es nur um die
              Verdrahtungs-Lücke)

## Root-Cause

`website/src/middleware.ts` exportiert `onRequest`, das heute NUR die
Locale-Middleware ausführt. Das in `website/src/middleware/logging.ts`
definierte `loggingMiddleware` (das `locals.requestId` + `locals.requestLogger`
setzt) ist nirgendwo importiert. Folgen:

- `App.Locals.requestLogger` ist laut `env.d.ts` Pflicht-Typ, wird aber nie
  gesetzt → jeder API-Handler, der `locals.requestLogger.error(...)` aufruft,
  wirft zur Laufzeit `TypeError: Cannot read properties of undefined`.
- Der `X-Request-ID`-Response-Header fehlt auf jeder Antwort.
- `request.start` / `request.end` Log-Lines werden nicht geschrieben.
- `errorResponse(code, locals.requestId, status)` (siehe
  `openspec/specs/centralized-logging.md` → Requirement "Standardized error
  response contract") liefert `requestId: undefined` im Response-Body.

Der Bug ist eine reine **Verdrahtungs-Lücke**: die Middleware-Funktion
existiert, ist typgeprüft, und hat 3 grüne Unit-Tests in
`website/src/middleware/logging.test.ts`. Was fehlt, ist der Eintrag in
`website/src/middleware.ts`.

## Fix-Ansatz

`website/src/middleware.ts` importiert `loggingMiddleware` aus
`./middleware/logging` und aus `astro:middleware` die `sequence(...)`-Funktion
und exportiert `onRequest = sequence(loggingMiddleware, localeMiddleware)`.

Reihenfolge-Begründung: `loggingMiddleware` MUSS vor der Locale-Middleware
laufen, weil:

1. `App.Locals.requestLogger` ist ab dem ersten Handler-Aufruf verfügbar —
   das schließt die `TypeError`-Lücke.
2. `locals.requestId` ist gesetzt, BEVOR der Locale-Cookie-Parsing-Code
   möglicherweise Fehler wirft (z. B. bei korrupten Cookies). Damit landen
   auch Fehler aus der Locale-Stufe mit Request-Korrelation in Loki.
3. Der `X-Request-ID` Echo-Header wird in `loggingMiddleware` an die Response
   gehängt — `sequence()` führt die Handler in Order aus und die finale
   Response (nach Locale) bekommt den Header korrekt gesetzt (Header-Set in
   `loggingMiddleware` erfolgt NACH `next()`).

## Subsysteme

- **`website/src/middleware.ts`** — Eintrittspunkt: bekommt 2 Funktions-Imports
  (`sequence`, `loggingMiddleware`) und ändert die Export-Form von
  `defineMiddleware(...)` zu `sequence(loggingMiddleware, defineMiddleware(...))`.
- **`website/src/middleware/middleware.test.ts` (NEU)** — Integrationstest
  mit `vi.mock('astro:middleware', ...)`, der den exportierten `onRequest`
  mit einem Fake-`APIContext` aufruft und verifiziert, dass
  `locals.requestLogger` definiert ist (analog zum bestehenden
  `logging.test.ts`).
- **`website/src/env.d.ts`** — unverändert (Typ ist bereits korrekt:
  `requestId: string` + `requestLogger: pino.Logger` sind beide required).
- **`openspec/specs/centralized-logging.md`** — unverändert. Die SSOT-Spec
  formuliert die Anforderung schon korrekt; die Implementation holt nur auf.
- Kein Kustomize-, ConfigMap-, OIDC- oder Helm-Change nötig.

## Edge-Cases

1. **Request mit `X-Request-ID`-Header** — bereits durch `logging.test.ts`
   Zeile 13–19 abgedeckt; `sequence()` ruft `loggingMiddleware` als ersten
   Handler auf, der Header wird re-used und auf der Response zurück-gesendet.
2. **Request ohne `X-Request-ID`-Header** — `nanoid(12)` wird erzeugt, im
   `locals.requestId` abgelegt, im `X-Request-ID` Response-Header gespiegelt.
3. **Locale-Cookie-Parse-Fehler** — falls die Cookie-Logik wirft, ist
   `locals.requestLogger` bereits gesetzt; der Fehler landet mit
   Request-Korrelation in Pino. Aktuell wirft `getLocaleFromCookie` aber
   nicht hart — Edge-Case nur theoretisch.
4. **Static-Asset-Requests (`.css`, `.js`, Bilder)** — `onRequest` läuft auf
   JEDEM Request in Astro. `loggingMiddleware` ist cheap (1 Header-Read,
   1 `pino.child()`, 2 Log-Lines), keine Performance-Sorge. Header wird auf
   die Response gesetzt, kein Doppel-Set möglich.
5. **Reihenfolge: logging VOR locale** — falls `locale` zuerst läuft und in
   einem hypothetischen Strict-Mode-Future eine Validierung wirft, hat der
   logging-Handler `locals.requestLogger` schon gesetzt. Umgekehrte Reihenfolge
   würde den TypeError zurückbringen. **Nicht umdrehen.**
6. **Astro-Node-Adapter-Header-Immutability** — bereits in
   `loggingMiddleware` Z. 34–38 abgefangen (`new Headers(response.headers)`).
   Kein zusätzlicher Code nötig.
7. **Vitest `astro:middleware`-Mock** — `defineMiddleware` und `sequence`
   werden beide gemockt, damit `website/src/middleware.ts` ohne Astro-Build
   importierbar ist. `defineMiddleware` → Identity-Wrapper (gibt Handler
   direkt zurück); `sequence(...)` → gibt einen Handler zurück, der die
   übergebenen Handler in Order aufruft und die `next()`-Kette manuell
   verkettet. Reicht für den einen Integrationstest, der nur
   `locals.requestLogger` nach `onRequest` prüft.

## Akzeptanzkriterien

- [ ] `website/src/middleware.ts` importiert `loggingMiddleware` und
  `sequence` und exportiert `onRequest = sequence(loggingMiddleware, localeMiddleware)`.
- [ ] `website/src/middleware/middleware.test.ts` existiert und enthält
  mindestens einen Test, der `onRequest` importiert, mit einem
  Fake-`APIContext` aufruft und verifiziert:
  - `locals.requestId` ist ein 12-Zeichen-String
  - `locals.requestLogger` ist definiert und ein `pino.Logger` mit
    `bindings().requestId` gesetzt
  - die Response trägt `X-Request-ID: <derselbe-id>`
- [ ] Test ist **RED vor dem Fix** (Mocks sind verdrahtet, der
  `onRequest`-Export setzt heute `locals.requestLogger` nicht) und **GREEN
  nach dem Fix**.
- [ ] Bestehende `logging.test.ts` (3 Tests) bleibt grün — keine Regression
  am reinen `loggingMiddleware`-Verhalten.
- [ ] `task test:changed` (Node-Projekt, weil nur `src/**/*.{ts,spec}.ts`
  unter `node` läuft) grün.
- [ ] `task freshness:regenerate` + `task freshness:check` grün.
- [ ] `task workspace:validate` grün (von der Änderung nicht betroffen,
  Smoke-Test).

## Out of Scope

- Änderung an `centralized-logging.md` SSOT-Spec (sie ist bereits korrekt).
- Bestehende `logging.test.ts`-Tests (bleiben unverändert).
- Andere Middlewares (es gibt aktuell nur die zwei: `locale` und `logging`).
- `pino`-Konfiguration (`logger.ts`) — der Bug liegt nicht in der
  Logger-Initialisierung, sondern im `middleware.ts`-Verdrahten.
- Hinzufügen von Retry/Backoff, Sampling, Log-Levels-Filterung in der
  Middleware — alle bestehende Spec-Anforderungen sind bereits erfüllt,
  sobald die Verdrahtung steht.
