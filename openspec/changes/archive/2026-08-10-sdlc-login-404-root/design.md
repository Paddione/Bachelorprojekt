---
ticket_id: T003036
plan_ref: openspec/changes/sdlc-login-404-root/tasks.md
status: active
date: 2026-08-09
---

# Design: SDLC-Login endet in Astro-Default-404

## Root Cause

Symptom und Ursache sind getrennt geprüft. Das Symptom ist reproduzierbar (curl gegen den
laufenden `sdlc-console`-Pod), die Ursache an der Quelle belegt — keine der beiden Aussagen
unten ist eine Vermutung.

**Symptom (beobachtet):** Nach dem Login über `http://sdlc.localhost/sdlc/cockpit` zeigt der
Browser Astros Default-404 mit `Path: /`. Dass es die *Default*-Seite ist und nicht die
gebrandete, ist selbst ein Beweisstück: es existiert keine `404.astro`-Route im Manifest.

**Ursache 1 (belegt an der Quelle):** Das Redirect-Ziel geht verloren.

| Stelle | Verhalten |
|---|---|
| `website/src/pages/sdlc/cockpit.astro:12` | `Astro.redirect('/login')` — ohne Ziel |
| `website/src/pages/login.astro:7` | `redirect('/api/auth/login', 302)` — ohne Durchreichung |
| `website/src/pages/api/auth/login.ts:6` | `url.searchParams.get('returnTo') \|\| '/'` → `/` |
| `website/src/lib/auth.ts:92` | `oidcStateStore.set(state, '/')` |
| `website/src/pages/api/auth/callback.ts:59` | `consumeReturnTo(state)` → `/` |

**Ursache 2 (belegt an der Quelle):** `/` existiert im sdlc-Build nicht.
`website/src/integrations/build-target.mjs` behält bei `BUILD_TARGET=sdlc` nur Routen unter
`/sdlc/` plus die Infra-Allowlist (`/api/health`, `/api/auth/`, `/sdlc/api/systemtest/`,
`/login.astro`). `index.astro` und `404.astro` fallen beide heraus.

Beide Ursachen sind notwendig, keine allein hinreichend: ohne Ursache 1 würde `/` nie
angesteuert; ohne Ursache 2 wäre der Zielverlust nur unbequem statt blockierend.

## Fix-Ansatz

Zwei Ebenen — die Ursache und ein Auffangnetz dahinter.

### Ebene 1 — das Ziel überlebt die Kette

`cockpit.astro` und `app-catalog.astro` (per grep die einzigen zwei SDLC-Seiten mit eigenem
`/login`-Redirect) geben ihr Ziel mit; `login.astro` reicht es durch:

```
Astro.redirect('/login?returnTo=' + encodeURIComponent(Astro.url.pathname + Astro.url.search))
```

`pathname + search` statt nur `pathname`: das Cockpit adressiert seine Bereiche über
`?tab=…`, und die Redirect-Map leitet `/admin/dora` bereits auf `/sdlc/cockpit?tab=analytics`.
Ohne den Query-Teil ginge dieser Kontext beim Login verloren.

`api/auth/login.ts` und `lib/auth.ts` bleiben unverändert. Sie funktionieren; ihnen fehlte nur
die Eingabe. `resolveReturnTo` lässt relative Pfade mit Query unverändert durch und verwirft
fremde Origins weiterhin fail-closed.

### Ebene 2 — `/` ist keine Sackgasse mehr

Neue Middleware-Stufe in `website/src/middleware.ts`, eingereiht **vor** `redirectMiddleware`:
bei `BUILD_TARGET === 'sdlc'` und `pathname === '/'` ein 302 auf `/sdlc/cockpit`.

Damit landet auch ein fail-closed auf `/` zurückgefallener `returnTo` im Cockpit. Die beiden
Ebenen ergänzen sich: Ebene 1 verhindert den Normalfall, Ebene 2 fängt jeden Restfall auf.

**Voraussetzung — und der subtilste Teil des Fixes:** `website/Dockerfile` setzt `BUILD_TARGET`
heute nur in der `build`-Stage (Zeile 48/49); die `runtime`-Stage ab Zeile 57 übernimmt es
nicht. Im laufenden Pod ist die Variable folglich nicht gesetzt (per `printenv` geprüft). Ohne
eine Durchreichung in die runtime-Stage — analog zu `GIT_SHA`/`BUILT_AT` — wäre die Middleware
stiller toter Code: lokal unter `task sdlc:dev` (setzt `export BUILD_TARGET=sdlc`) einwandfrei,
nur im Image wirkungslos. Der Build-Workflow übergibt das Build-Arg bereits
(`.github/workflows/build-sdlc-console.yml:77`).

### Verworfen: `404.astro` in die Infra-Allowlist

Der naheliegende Weg — `404.astro` neben `/login.astro` in `INFRA_ROUTE_SUFFIXES` — wurde nach
Sichtung der Datei verworfen. `website/src/pages/404.astro` ist keine generische Fehlerseite,
sondern eine gebrandete **Wartungsseite** mit vollem `Layout.astro`
(„Wir befinden uns derzeit in Wartungsarbeiten", Verweis aufs Impressum). Sie in den sdlc-Build
zu ziehen brächte Marketing-Layout in eine interne Console und meldete Wartung, wo schlicht ein
Pfad nicht existiert. Der Middleware-Weg nutzt stattdessen den Redirect-Layer, den es hier
ohnehin schon gibt, und fasst das Route-Manifest gar nicht an.

## Betroffene Subsysteme

| Subsystem | Datei | Art |
|---|---|---|
| SDLC-Seiten | `sdlc/cockpit.astro`, `sdlc/app-catalog.astro` | returnTo mitgeben |
| Login-Kette | `login.astro` | returnTo durchreichen |
| Request-Layer | `middleware.ts` | neue sdlc-Root-Stufe |
| Image | `website/Dockerfile` | `BUILD_TARGET` in die runtime-Stage |

Nicht betroffen: `build-target.mjs`, `404.astro`, `api/auth/login.ts`, `lib/auth.ts`,
`middleware/redirect-map.ts` sowie die übrigen SDLC-Seiten — `pipeline.astro` und Verwandte
leiten auf `/admin/cockpit` um und laufen über die bestehende Redirect-Map.

## Edge-Cases

- **Manipuliertes `returnTo`** → `resolveReturnTo` verwirft es und fällt auf `/` zurück; dort
  greift Ebene 2. Kein 404, keine Weiterleitung auf einen fremden Origin.
- **prod-Build** → Middleware-Bedingung ist falsch, `/` bleibt die Startseite. Verhalten
  unverändert.
- **Kein `BUILD_TARGET` gesetzt** (lokaler `pnpm dev` ohne Export) → Bedingung falsch,
  Middleware inaktiv, alle Routen vorhanden. Unkritisch.
- **Cross-Origin-React-SPA** → nutzt dieselbe Auth über `REACT_APP_ORIGIN`; die Änderung
  betrifft nur relative Pfade und lässt diesen Pfad unberührt.

## Teststrategie

| Test | Datei | Prüft |
|---|---|---|
| Middleware-Verhalten | `website/src/middleware.test.ts` | `/` → 302 `/sdlc/cockpit` bei `sdlc`; unverändert bei `prod` |
| returnTo-Durchreichung | `website/src/pages/api/auth/login.test.ts` (neu) | `?returnTo=…` landet im state-Store und kommt unverändert zurück |
| Runtime-Env | `tests/spec/sdlc-cockpit/build-target-runtime-env.bats` (neu) | runtime-Stage des Dockerfiles setzt `BUILD_TARGET` |

Die ersten beiden prüfen Laufzeitverhalten. Der BATS-Guard prüft eine Konfigurationsdatei,
deren Ergebnis sich ausschließlich im Quelltext manifestiert — der dokumentierte Ausnahmefall
der Output-Verifikations-Konvention; der Header der Testdatei hält das fest.

**Bekannte Lücke, bewusst offen gelassen:** Die drei `.astro`-Redirects sind nicht unit-testbar.
Sie werden per curl gegen den neu gebauten sdlc-Container verifiziert — dieselbe Probe, die den
Bug reproduziert hat. Ein Playwright-E2E für den vollständigen OIDC-Login-Durchlauf wäre ein
eigener Vorgang mit eigenem Ticket und gehört nicht in diesen Bugfix.
