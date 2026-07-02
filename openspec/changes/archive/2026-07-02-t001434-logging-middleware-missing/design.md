## Context

`website/src/middleware.ts` ist der einzige Astro-Middleware-Entry-Point. Aktuell:

```ts
import { defineMiddleware } from 'astro:middleware';
import { getLocaleFromCookie, defaultLocale, type Locale } from './i18n/index';

const VALID_LOCALES: Locale[] = ['de', 'en'];

export const onRequest = defineMiddleware(async (context, next) => {
  const cookieHeader = context.request.headers.get('cookie') ?? undefined;
  const cookieLocale = getLocaleFromCookie(cookieHeader);
  const locale = cookieLocale && VALID_LOCALES.includes(cookieLocale) ? cookieLocale : defaultLocale;
  context.locals.locale = locale;
  return next();
});
```

Das in `website/src/middleware/logging.ts` definierte `loggingMiddleware` setzt `locals.requestId` und `locals.requestLogger` (pino-Child-Logger mit Request-Bindings) und schreibt `request.start` / `request.end` Log-Lines. Der Bug: `middleware.ts` importiert es nicht. Damit ist `App.Locals.requestLogger` zur Laufzeit `undefined`, obwohl `env.d.ts` es als required typisiert.

`App.Locals.requestLogger` wird in `website/src/pages/api/_errors.ts` und in vielen API-Handlern unter `website/src/pages/api/` aufgerufen. Folge: Auf jedem Request crasht jeder Code-Pfad, der `locals.requestLogger.info(...)` o.ä. aufruft, mit `TypeError`.

## Goals / Non-Goals

**Goals:**
- `onRequest` ruft `loggingMiddleware` als ersten Schritt auf, sodass `locals.requestId` und `locals.requestLogger` für alle nachfolgenden Handler verfügbar sind.
- Reihenfolge: `loggingMiddleware` VOR `localeMiddleware` — Locale-Handler können sich ebenfalls auf `locals.requestLogger` verlassen.
- Bestehende Locale-Logik bleibt unverändert (kein Refactor am Locale-Body).
- Neuer Vitest-Integrationstest verifiziert den Vertrag über `onRequest`.

**Non-Goals:**
- Refactor am `loggingMiddleware`-Body (der ist korrekt und gut getestet).
- Refactor am `localeMiddleware`-Body.
- Hinzufügen von weiterer Middleware (z. B. Auth-Check, Rate-Limit, Request-Timeout) — separater Change.
- Änderung an `centralized-logging.md` SSOT-Spec (sie ist bereits korrekt).
- Hinzufügen von Log-Sampling, Log-Level-Filterung, etc.

## Decisions

**Astro `sequence()` statt manuelles Chaining**

Astro 7 exportiert `sequence(...handlers)` aus `astro:middleware`, das die Handler in Order ausführt und die `next`-Kette threaded. Das ist der idiomatische Weg, mehrere Middlewares zu kombinieren, und wird vom Astro-Kernteam empfohlen. Manuell Chaining (`onRequest = async (ctx, next) => await loggingMiddleware(ctx, () => localeMiddleware(ctx, next))`) wäre fehleranfällig (Reihenfolge-Inversion, kein `next`-Durchschleifen bei Multistep-Handlern).

**Reihenfolge: logging VOR locale**

`loggingMiddleware` setzt `locals.requestLogger`, das `localeMiddleware` braucht, falls die Locale-Logik jemals Fehler loggen will (heute tut sie das nicht hart, aber: Defensiv-Prinzip). Wenn `locale` zuerst läuft und ein hypothetisches Cookie-Parse-Error auftritt, fehlt `locals.requestLogger` → der Fehler kann nicht mit Request-Korrelation in Pino landen. Daher: logging zuerst.

**Mock-Strategie für den Test: `vi.mock('astro:middleware', ...)`**

`astro:middleware` ist ein virtuelles Modul, das nur innerhalb des Astro-Build-Pipelines existiert. Im Vitest-Node-Projekt muss es gemockt werden. `defineMiddleware` ist ein Identity-Wrapper; `sequence` baut die `next`-Kette manuell auf (reverse-loop: der innerste Handler ruft den `next` des äußersten auf). Das reicht für den einen Integrationstest, der nur `locals.requestLogger` + `X-Request-ID` Echo prüft. Existierende Konvention: `website/src/lib/claude.test.ts:4` und `live-state.fetch.test.ts:3` nutzen denselben `vi.mock`-Pattern.

**Test-Lokation: `website/src/middleware.test.ts` (nicht `src/middleware/middleware.test.ts`)**

Bestehende Konvention: `src/middleware/logging.test.ts` ist SIBLING von `src/middleware/logging.ts`. Analog dazu: `src/middleware.test.ts` ist SIBLING von `src/middleware.ts` (beide auf der gleichen Hierarchie-Ebene in `src/`). Vorteil: der Test importiert `./middleware` statt `./middleware/middleware` (kürzerer Pfad), und die Namens-Analogie zu `logging.test.ts` (Sibling of `logging.ts`) ist klar.

## Risks / Trade-offs

- [`sequence()` ist nicht in älteren Astro-Versionen verfügbar] → aktuelle `astro@7.0.3` (siehe `package.json`) exportiert es; CI-Tests laufen gegen diese Version. Kein Versions-Risiko.
- [Mock von `astro:middleware` weicht von echter Astro-Runtime ab] → der Mock ist eine Vereinfachung; in echtem Astro würde `sequence()` exakt dieselbe `next`-Kette bauen. Mock deckt den Vertrag, nicht die Implementation. Reicht für diesen Fix, da `loggingMiddleware` selbst bereits 3 echte Unit-Tests hat.
- [Test-Mock könnte `defineMiddleware`-Kontrakte (z. B. Type-Assertions) verfehlen] → der Mock implementiert nur den funktionalen Vertrag, nicht die Type-Layer; TypeScript-Compiler akzeptiert es (siehe `tsconfig.json` `astro/tsconfigs/strict`).

## Migration Plan

Keine spezielle Migration erforderlich:
- Die Änderung ist additive in `website/src/middleware.ts` (2 neue Imports, 1-Zeilen-Export-Form-Änderung).
- Kein DB-Schema-Change, kein API-Contract-Change, keine Kustomize-Änderung.
- Deploy via Standard-`task workspace:deploy ENV=mentolder` (oder ENV=korczewski — die `loggingMiddleware` ist brand-agnostisch).
- Rollback: Git-Revert auf main + Redeploy.

## Open Questions

_Keine._ Der Fix ist mechanisch (Verdrahtung einer bestehenden Funktion); keine Design-Entscheidungen offen.
