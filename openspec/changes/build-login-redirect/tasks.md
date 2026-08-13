---
title: "build-login-redirect — Implementation Plan"
ticket_id: T003746
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# build-login-redirect — Implementation Plan

_Ticket: T003746 — 10 von 12 SDLC-Seiten umgehen buildLoginRedirect — returnTo geht verloren_

## File Structure

```
website/src/pages/sdlc/architektur.astro            # !session-Gate: getLoginUrl → buildLoginRedirect
website/src/pages/sdlc/ki-konfiguration.astro       # dito
website/src/pages/sdlc/platform.astro               # dito
website/src/pages/sdlc/prompts.astro                # dito
website/src/pages/sdlc/repohealth.astro             # dito
website/src/pages/sdlc/software-history.astro       # dito (nutzt pathname+search, nicht Astro.url)
website/src/pages/sdlc/systemtest/board.astro       # dito
website/src/pages/sdlc/tickets/[id].astro           # dito
tests/spec/sdlc-cockpit/login-redirect-all-pages.bats  # NEU: Guard — Location je Seite (Output-Verifikation)
website/src/data/test-inventory.json                # regeneriert (task test:inventory)
<!-- vitest: kein neuer Vitest-Test nötig — login-redirect.ts bleibt unverändert und ist durch
     login-redirect.test.ts abgedeckt; die je-Seite-Verdrahtung sichert der BATS-Guard ab -->
```

**S1-Budgets** (alle nicht-baselined, .astro-Limit 600): architektur 23 Zeilen, ki-konfiguration
17, platform 44, prompts 29, repohealth 21, software-history 15, board 419, tickets/[id] 292 —
je Änderung netto +1 Zeile (Import-Zeile kommt dazu, `getLoginUrl` verschwindet aus dem
auth-Import). Budget unkritisch.

## Tasks

### T1: Guard-Test schreiben und rot laufen lassen

**Dateien:** `tests/spec/sdlc-cockpit/login-redirect-all-pages.bats` (neu)

Neuer BATS-Guard nach dem Muster von `tests/spec/sdlc-cockpit/navigation-no-dead-links.bats`
(node-Helper per Heredoc im setup, Ausführung mit `node --experimental-strip-types`):

- Helper (`login-redirect-guard.mjs`, in `$BATS_TEST_TMPDIR`):
  1. Läuft rekursiv über `website/src/pages/sdlc/` und sammelt alle `.astro`-Seiten, deren
     Frontmatter eine `!session`-Bedingung mit `Astro.redirect(...)` enthält (Auth-Gate).
  2. Extrahiert pro Seite den Redirect-Ausdruck der ersten `!session`-Zeile
     (z. B. `getLoginUrl(Astro.url.pathname)` oder `buildLoginRedirect(Astro.url)`).
  3. Importiert die **echte** `buildLoginRedirect` aus
     `website/src/lib/login-redirect.ts` (reines TS ohne Imports → dynamischer Import
     funktioniert unter `--experimental-strip-types`, node ≥ 22.6; lokal gegen 22.23.2
     verifiziert). `getLoginUrl` ist im Sandbox-Kontext ein Sentinel, der
     `OIDC-DIRECT:` + übergebene Argumente zurückgibt.
  4. Wertet den Ausdruck aus (`new Function('Astro', 'getLoginUrl', 'buildLoginRedirect',
     'return (' + expr + ')')`) mit `Astro = { url }`, wobei `url` eine Beispiel-URL
     der jeweiligen Route inklusive Query (`?tab=analytics`) ist.
  5. Assertions je Seite:
     - ausgewertete Location beginnt mit `/login?returnTo=`,
     - `returnTo` entspricht exakt Pfad + Query des aufgerufenen Ziels,
     - der returnTo-Pfad löst gegen `website/src/pages/` in eine existierende Datei auf
       (`[x].astro`-Muster für dynamische Segmente wie `tickets/<id>`),
     - **Negativ-Anker:** keine Seite evaluiert auf die Sentinel-Location
       (`OIDC-DIRECT:`).
  6. Positiv-Anker: der Kandidatensatz enthält mindestens die 8 betroffenen + 2 korrekte
     Seiten (cockpit, app-catalog) — eine Seite ohne Gate oder mit fehlendem Redirect
     fällt durch die `!session`-Extraktion auf.

Der Test läuft mit dem echten BATS-Runner:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/login-redirect-all-pages.bats
```

**expected: FAIL** — die 8 Seiten nutzen noch `getLoginUrl` → Evaluation liefert die
Sentinel-Location → Assertion „Location beginnt mit /login?returnTo=" ist rot. (Die
Positiv-Anker der korrekten Seiten bleiben grün; der Test dokumentiert im Header
Prüfmodus Output-Verifikation [T002448-M4]).

### T2: Auth-Gates der 8 SDLC-Seiten auf buildLoginRedirect umstellen

**Dateien:** die 8 Seiten aus File Structure

Je Seite exakt drei Änderungen (Muster identisch zu `cockpit.astro`/`app-catalog.astro`):

1. `getLoginUrl` aus dem `../../lib/auth`-Import entfernen (bzw. `../../../lib/auth` bei
   `systemtest/board.astro` und `tickets/[id].astro`).
2. Importzeile ergänzen: `import { buildLoginRedirect } from '<tiefe>/lib/login-redirect';`
   (Tiefe wie der auth-Import: `../../` bzw. `../../../`).
3. `!session`-Zweig umstellen:
   - `return Astro.redirect(getLoginUrl(Astro.url.pathname));` →
     `return Astro.redirect(buildLoginRedirect(Astro.url));`
   - `software-history.astro` Sonderfall:
     `getLoginUrl(Astro.url.pathname + Astro.url.search)` →
     `buildLoginRedirect(Astro.url)` (das Ziel inklusive Query steckt bereits in
     `Astro.url`; `buildLoginRedirect` übernimmt Pfad + Search selbst).

**Nicht** angefasst: der `!isAdmin(session) → '/admin'`-Zweig (Autorisierung, außerhalb
des Scopes, D1) und Seiten ohne Auth-Gate (`design-system.astro`, `observability.astro`).

### T3: Guard grün, Inventory, Verify

**Dateien:** `website/src/data/test-inventory.json`

Kein neuer Vitest-Test nötig: `website/src/lib/login-redirect.ts` bleibt unverändert und
ist durch `login-redirect.test.ts` abgedeckt — die je-Seite-Verdrahtung sichert der
BATS-Guard ab.

1. Guard-Lauf (erwartet grün):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/login-redirect-all-pages.bats
```

2. Test-Inventory regenerieren (CI-Job „Test inventory check" failt sonst):

```bash
task test:inventory
```

3. Abschließende Verifikation:

```bash
task test:changed; task freshness:regenerate; task freshness:check;
```
