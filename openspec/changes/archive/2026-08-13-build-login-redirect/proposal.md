# Proposal: build-login-redirect

## Why

T003036 hat den returnTo-durchreichenden Login-Weg (`buildLoginRedirect` → `/login?returnTo=...`)
eingeführt, aber nur in 2 der SDLC-Seiten eingebaut (`cockpit.astro`, `app-catalog.astro`).
Die übrigen SDLC-Seiten mit Auth-Gate springen weiterhin über `getLoginUrl()` direkt zum
OIDC-Provider — der `returnTo` des aufgerufenen Ziels geht dabei verloren. Nach dem Login
landet der User nicht auf der Seite, die er aufgerufen hat (Tab-Auswahl `?tab=…` inklusive).

Die Messung im Ticket (2026-08-11, gegen den laufenden `sdlc-console`-Pod) belegt den
Defekt: `/sdlc/cockpit` liefert `Location: /login?returnTo=%2Fsdlc%2Fcockpit` (richtig),
`/sdlc/repohealth` liefert direkt die OIDC-Authorize-URL ohne durchgereichten `returnTo`.

Seit T003737 (gemergt 2026-08-13, b16e0acfa) sind `bugs.astro` und `pipeline.astro`
gelöscht — die betroffene Menge ist von 10 auf **8 Seiten** geschrumpft. `design-system.astro`
und `observability.astro` haben kein Auth-Gate (öffentliche Seiten) und sind kein Gegenstand.

## What

Alle SDLC-Seiten mit Auth-Gate leiten unauthentifizierte Aufrufe über `buildLoginRedirect`
um, damit `returnTo` (Pfad + Query-String) durch die Login-Kette überlebt. Betroffen sind
8 Seiten:

- `pages/sdlc/architektur.astro`
- `pages/sdlc/ki-konfiguration.astro`
- `pages/sdlc/platform.astro`
- `pages/sdlc/prompts.astro`
- `pages/sdlc/repohealth.astro`
- `pages/sdlc/software-history.astro`
- `pages/sdlc/systemtest/board.astro`
- `pages/sdlc/tickets/[id].astro`

Muster (identisch zu `cockpit.astro` / `app-catalog.astro`): der `!session`-Zweig wird von
`Astro.redirect(getLoginUrl(Astro.url.pathname))` auf
`Astro.redirect(buildLoginRedirect(Astro.url))` umgestellt; `getLoginUrl` verschwindet aus
dem Import. Der separate `!isAdmin(session) → /admin`-Zweig bleibt unverändert
(Autorisierung ist nicht Gegenstand dieses Tickets).

Ein BATS-Guard (Output-Verifikation) prüft je SDLC-Seite mit Auth-Gate, dass die vom Gate
emittierte Location `/login?returnTo=<pfad+query>` ist — bewertet über die echte
`buildLoginRedirect`-Implementierung, nicht über das Vorkommen des Bezeichners im Quelltext.

## Non-Goals

- Kein Umbau des `isAdmin`-Zweigs (Autorisierung ≠ Login-Redirect).
- Keine Änderung an `design-system.astro` / `observability.astro` (kein Auth-Gate).
- Keine Änderung an Pocket-ID-Client-Konfiguration: die `redirect_uri` auf
  `web.localhost` ist **beabsichtigt** (siehe design.md, Nebenbefund aus T003746).
- Keine Änderung an `login-redirect.ts` selbst (Funktionen sind seit T003036 korrekt).
