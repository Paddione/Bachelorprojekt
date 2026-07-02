## Why

`website/src/middleware.ts` exportiert `onRequest`, der heute NUR die Locale-Middleware ausführt. Das in `website/src/middleware/logging.ts` definierte `loggingMiddleware` (das `locals.requestId` + `locals.requestLogger` setzt) ist nirgendwo importiert. Folge: `App.Locals.requestLogger` ist zur Laufzeit `undefined` — jeder API-Handler, der `locals.requestLogger.error(...)` aufruft, wirft `TypeError: Cannot read properties of undefined`. Der `X-Request-ID` Response-Header fehlt auf jeder Antwort, `request.start` / `request.end` werden nicht geloggt, und `errorResponse(code, locals.requestId, status)` liefert `requestId: undefined` im Body. Der Bug ist eine reine Verdrahtungs-Lücke: die Middleware-Funktion existiert, ist typgeprüft, hat 3 grüne Unit-Tests in `website/src/middleware/logging.test.ts`. Es fehlt nur der Eintrag in `website/src/middleware.ts`.

## What Changes

- `website/src/middleware.ts` importiert `loggingMiddleware` aus `./middleware/logging` und `sequence` aus `astro:middleware`, und exportiert `onRequest = sequence(loggingMiddleware, localeMiddleware)`.
- Neuer Vitest-Test `website/src/middleware.test.ts` (mit `vi.mock('astro:middleware', ...)`) verifiziert, dass der exportierte `onRequest` `locals.requestId` + `locals.requestLogger` setzt und `X-Request-ID` auf der Response zurückgibt.

## Capabilities

### New Capabilities

- _Keine neuen Capabilities_ — der Fix setzt eine bestehende SSOT-Anforderung um.

### Modified Capabilities

- _Keine Modified Capabilities_ — `openspec/specs/centralized-logging.md` ist bereits korrekt; der Requirement-Block "X-Request-ID injection and request lifecycle logging" ist SSOT und beschreibt genau das, was die Verdrahtung jetzt umsetzt. **Kein Delta-Spec nötig.**

## Impact

- `website/src/middleware.ts` — Import-Block + Re-Export (Ist 12 LOC → voraussichtlich 14 LOC, +2 Netto).
- `website/src/middleware.test.ts` (NEU) — Integrationstest mit Astro-Middleware-Mock, 3 Test-Cases (Ist 0 → voraussichtlich ~80 LOC).
- `openspec/specs/centralized-logging.md` — unverändert (Spec ist bereits korrekt formuliert).
- `website/src/middleware/logging.ts` — unverändert (3 grüne Unit-Tests bleiben grün, keine Regression).
- Kein Kustomize-, ConfigMap-, OIDC- oder Helm-Change nötig.
- Kein Datenbank- oder API-Contract-Change.
