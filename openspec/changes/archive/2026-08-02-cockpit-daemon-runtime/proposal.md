# Proposal: cockpit-daemon-runtime

## Why

Der SDLC-Cockpit-Daemon unter `.lavish/kit/daemon/` wurde nie in lauffähigem Zustand
eingecheckt. Der Quellbaum ist versioniert (18 TypeScript-Dateien), es fehlt aber jeder
Lauf-Kontrakt: keine Dependency-Deklaration, keine tsconfig-Referenz, kein Start-Task.

### Symptom (beobachtet, reproduziert am 2026-08-01)

Trennung nach Bug-Triage-Konvention T002448-M5 — was gemessen wurde, nicht was vermutet wird:

- `npx tsx .lavish/kit/daemon/server.ts` bricht mit `ERR_MODULE_NOT_FOUND: Cannot find
  package 'hono'` ab. Das gilt nicht nur für einen frischen Checkout: auch die
  Entwicklungsmaschine hat weder `node_modules/hono` noch `node_modules/@hono`.
- `bats tests/spec/sdlc-cockpit/` liefert 41× `ok`, davon **24× `skip`** mit der Begründung
  „Daemon not running". Real ausgeführt werden 17 Tests, alle statisch.
- Keine `package.json` im Repo deklariert `hono` oder `@hono/node-server`; unter `.lavish/`
  existiert überhaupt keine.
- `tsconfig.json` führt 8 Projektreferenzen, keine davon zeigt auf den Daemon — `npm run
  typecheck` erfasst ihn nicht.
- Der einzige Cockpit-Task, `cockpit:dev` (`Taskfile.yml:4021`), startet
  `python3 -m http.server` für die statischen HTML-Dateien und berührt den Daemon nicht.

### Bewertung

Ein `skip` ist in bats ein `ok`. Die Suite war deshalb grün, ohne je eine Route berührt zu
haben — einschließlich der Security-Guards aus T002505 (Auth-Middleware, entfernter
Token-Endpoint). Der Kommentar in `tests/unit/cockpit-daemon-injection.test.ts:23` verweist
darauf, dass die Route-Ebene von `daemon-token-endpoint-removed.bats` abgedeckt sei; faktisch
lief dieser Test nie.

Es handelt sich nicht um eine Regression, sondern um einen nie hergestellten Zustand.

### Zwei Folgebefunde aus der Analyse

1. **`/health` verletzt den D12-Kontrakt.** Der Endpoint liefert `{ status, uptime }` ohne
   `fetchedAt`; der geskippte Test „D12: /health has fetchedAt" wird beim ersten echten Lauf
   rot. Das belegt, dass die Skips keine kosmetische Lücke waren.
2. **Ein zweiter Startfehler wartet hinter dem ersten.** `server.ts:23` verwendet
   `require('fs')`, während die Root-`package.json` `"type": "module"` setzt. In ESM ist
   `require` nicht definiert. Verifizieren lässt sich das erst, wenn `hono` auflösbar ist —
   der erste Blocker verdeckt den zweiten.

## What

Vier Bausteine in Abhängigkeitsreihenfolge:

1. **Lauf-Kontrakt** — `hono`, `@hono/node-server` und `tsx` als gepinnte
   `devDependencies` in der Root-`package.json`; ESM-konformer `fs`-Import in `server.ts`;
   tsconfig-Referenz, damit der Typecheck den Daemon erfasst.
2. **Start-Weg** — `task cockpit:daemon`, der den Daemon startet, auf `/health` wartet und
   laut scheitert, statt still im Hintergrund zu sterben.
3. **Fail-closed CI-Gate** — Daemon-Start im `test-factory-shard`-Job vor der bats-Suite;
   `COCKPIT_DAEMON_REQUIRED=1` lässt die betroffenen `setup()`-Funktionen `fail` statt
   `skip`. Ohne die Variable bleibt lokal das Skip-Verhalten erhalten.
4. **Tests** — Guard gegen `ci.yml`; drei echte Unit-Tests gegen `lib/cache.ts` anstelle der
   Platzhalter; drei immer-grüne Adapter-Attrappen entfernt; Behebung dessen, was die 24 nun
   laufenden Tests aufdecken.

### Nicht im Scope

Write-Endpunkte (`K4`-Stubs), die CORS-Herkunft `'null'` und die unauthentifizierten
GET-Routen. Das sind bekannte, in `server.ts:57-71` dokumentierte Punkte aus T002505 und
gehören nicht in einen Lauf-Kontrakt-Fix.

_Ticket: T002508_
