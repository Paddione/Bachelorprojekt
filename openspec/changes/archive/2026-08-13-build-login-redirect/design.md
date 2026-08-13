# Design — build-login-redirect

## Goals

- Jede SDLC-Seite mit Auth-Gate leitet unauthentifizierte Aufrufe über
  `buildLoginRedirect(Astro.url)` um → `/login?returnTo=<pfad+query>`.
- `returnTo` überlebt die Login-Kette inklusive Query-String (Tab-Auswahl).
- BATS-Guard mit Output-Verifikation: prüft die je Seite emittierte Location, nicht das
  Vorkommen des Bezeichners im Quelltext.

## Non-Goals

- Kein Umbau der Autorisierung (`!isAdmin → /admin` bleibt wie ist).
- Keine Änderung an `login-redirect.ts` (T003036 hat die Funktionen korrekt gebaut).
- Keine Änderung an der OIDC-Client-Konfiguration (Nebenbefund, siehe Decision D2).
- `design-system.astro` / `observability.astro`: kein Auth-Gate → kein Gegenstand.

## Decisions

### D1: Nur der `!session`-Zweig wird umgestellt; `!isAdmin` bleibt

Die korrekten Seiten (`cockpit.astro`, `app-catalog.astro`) kombinieren beide Checks in
einer Zeile: `if (!session || !isAdmin(session)) return Astro.redirect(buildLoginRedirect(Astro.url));`.
Die 8 betroffenen Seiten haben zwei getrennte Zweige:

```ts
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
```

**Entscheidung:** Nur der erste Zweig wird auf `buildLoginRedirect(Astro.url)` umgestellt,
der zweite bleibt unverändert. Begründung: Der Defekt (T003746) ist der verlorene
`returnTo` auf dem Login-Pfad. Die Umleitung eines eingeloggten Nicht-Admins auf `/admin`
ist eine separate Autorisierungsentscheidung; ein Zusammenlegen würde Verhalten ändern,
das außerhalb des Ticket-Scopes liegt und nicht gemessen wurde.

### D2: Nebenbefund `redirect_uri=web.localhost` ist beabsichtigt — keine Änderung

Das Ticket fragt im Plan zu klären, ob die `redirect_uri` auf `web.localhost` (statt
`sdlc.localhost`) beabsichtigt ist. Befund aus den Manifests:

- `k3d/sdlc-stack/sdlc-console.yaml` setzt `SITE_URL: "http://web.localhost"` mit Kommentar:
  „Muss zum registrierten OIDC-Callback passen: der Seed-Job leitet ihn als
  `web.<suffix>/api/auth/callback` aus `POCKET_ID_FRONTEND_URL` ab. Mit `sdlc.localhost`
  sendet die Console eine redirect_uri, die Pocket ID nicht kennt."
- `k3d/sdlc-stack/sdlc-ingress.yaml` routet **beide** Hosts (`sdlc.localhost` und
  `web.localhost`) auf denselben Service `sdlc-console` — der Login-Pfad läuft über
  `web.localhost`, weil nur dort die Callback-URL registriert ist.
- `k3d/pocket-id-client-seed.yaml` (Zeile 256) provisioniert den `website`-Client mit
  `redirect_uri = ${SCHEME}://web.${SUFFIX}/api/auth/callback` — ein gemeinsamer
  OIDC-Client für beide Hosts.

**Entscheidung:** Die `redirect_uri` auf `web.localhost` ist absichtlich (gemeinsamer
OIDC-Client, Callback-URL konsistent zum Seed-Job). Kein Manifest-Eingriff — der wäre
beim nächsten `workspace:deploy` vom Seed-Job ohnehin wieder überschrieben.

### D3: Guard-Test bewertet die emittierte Location über die echte Implementierung

Der DoD verlangt Output-Verifikation je Seite, nicht Identifier-Grep. Die BATS-Umgebung
(CI-Job `test-bats`, node 22, `npm ci` im Root) kann die Astro-Server nicht booten (keine
website-Dependencies, keine DB). Stattdessen wertet der Guard das tatsächliche
Gate-Redirect-Ziel jeder Seite aus:

- Node-Helper importiert die **echte** `buildLoginRedirect` aus
  `website/src/lib/login-redirect.ts` (reines TS ohne Imports → via
  `node --experimental-strip-types`, lokal gegen node 22.23.2 verifiziert).
- Pro SDLC-Seite mit Auth-Gate wird der Redirect-Ausdruck des `!session`-Zweigs
  („erster `Astro.redirect(...)` hinter einer `!session`-Bedingung") extrahiert und im
  Sandbox-Kontext ausgewertet, in dem `buildLoginRedirect` echt und `getLoginUrl` ein
  Sentinel ist (liefert eine Nicht-`/login`-Location).
- Assertion: die ausgewertete Location beginnt mit `/login?returnTo=`, der `returnTo`-Wert
  entspricht Pfad + Query des aufgerufenen Ziels und löst gegen `website/src/pages/` in
  eine existierende Routendatei auf (`[x].astro`-Muster für dynamische Segmente).
- Nutzt eine Seite weiterhin `getLoginUrl`, evaluiert die Assertion auf die Sentinel-
  Location → Test rot. Damit ist der Test rot, solange die Implementierung fehlt
  (Positiv-Anker: die Seite selbst ist im Kandidatensatz).

## Trade-offs

- **Sandbox-Evaluation statt HTTP-Server:** Der Guard testet den Redirect-Ausdruck der
  Seite gegen die echte Funktion — nicht den vollständigen Astro-Request-Pfad. Der
  Request-Pfad ist durch die bestehende Vitest-Suite (`login-redirect.test.ts`) plus die
  e2e-Tests abgedeckt; der Guard sichert die je-Seite-Verdrahtung, die das Ticket-Defizit
  ausmacht.
- **`getLoginUrl`-Sentinel statt echtem Import:** `auth.ts` zieht `pg`/DB-Imports und
  Env-Variablen, die in der BATS-Job-Umgebung nicht existieren. Der Sentinel bildet genau
  die unterscheidende Eigenschaft ab: `getLoginUrl` liefert eine OIDC-Authorize-URL, die
  nie mit `/login?returnTo=` beginnt.
