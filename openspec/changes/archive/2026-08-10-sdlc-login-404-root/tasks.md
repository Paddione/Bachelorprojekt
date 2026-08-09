---
title: SDLC-Login endet in Astro-Default-404 auf /
ticket_id: T003036
domains: [bachelorprojekt-website]
status: plan_staged
---

# SDLC-Login endet in Astro-Default-404 auf / — Implementation Plan

Der Login in die SDLC-Console endet auf Astros Default-404 (`Path: /`). Ursache ist ein
verlorenes Redirect-Ziel in der Login-Kette, kombiniert mit einer im sdlc-Build nicht
existierenden Root-Route. Der Fix setzt an beiden Stellen an: die Kette trägt das Ziel
durch, und `/` wird im sdlc-Build auf das Cockpit umgeleitet.

Ursachenanalyse, verworfene Alternativen und Edge-Cases: `design.md` im selben Ordner.

## File Structure

| Datei | Art | S1-Budget |
|---|---|---|
| `website/src/lib/login-redirect.ts` | neu — Ableitung des Login-Redirect-Ziels | neu, 900 (.ts) |
| `website/src/lib/login-redirect.test.ts` | neu — RED-Test dazu | neu, 900 (.ts) |
| `website/src/pages/sdlc/cockpit.astro` | ändern — `returnTo` mitgeben | 264/600, Reserve 336 |
| `website/src/pages/sdlc/app-catalog.astro` | ändern — `returnTo` mitgeben | 66/600, Reserve 534 |
| `website/src/pages/login.astro` | ändern — `returnTo` durchreichen | 8/600, Reserve 592 |
| `website/src/middleware.ts` | ändern — sdlc-Root-Stufe | 22/900, Reserve 878 |
| `website/src/middleware.test.ts` | ändern — RED-Tests dazu | 144/900, Reserve 756 |
| `website/Dockerfile` | ändern — `BUILD_TARGET` in die runtime-Stage | ungated (keine Extension) |
| `tests/spec/sdlc-cockpit/build-target-runtime-env.bats` | neu — Guard dazu | ungated (.bats) |

## Partials

| # | Rolle | Ziel-Dateien |
|---|---|---|
| p1 | website | alle oben gelisteten Dateien |

Ein einzelnes Partial: die vier Produktionsdateien hängen über ein gemeinsames Modul
zusammen und lassen sich nicht disjunkt aufteilen, ohne dass ein Teil gegen ein noch
nicht existierendes Modul implementiert.

## Tasks

### 1. RED-Tests bestätigen — expected: FAIL

Die Tests liegen bereits im Stage-Commit. Vor der Implementierung ihren roten Zustand
bestätigen, damit der Rot-Grün-Übergang belegt ist:

```bash
cd website && npx vitest run src/lib/login-redirect.test.ts src/middleware.test.ts
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/build-target-runtime-env.bats
```

expected: FAIL — `login-redirect.test.ts` scheitert am Import (Modul fehlt noch),
`middleware.test.ts` liefert 200 statt 302 auf `/`, und im BATS-Guard sind die beiden
`BUILD_TARGET`-Aussagen rot, während der GIT_SHA-Positiv-Anker grün bleibt.

### 2. Modul `website/src/lib/login-redirect.ts` anlegen

Zwei reine Funktionen, keine Astro-Abhängigkeit:

- `buildLoginRedirect(url: URL): string` — liefert `/login?returnTo=<encoded>`, wobei
  `<encoded>` das `encodeURIComponent` von `url.pathname + url.search` ist. Das Encoding
  ist zwingend: ohne es würde der Query-Teil des Ziels als zweiter Parameter der
  `/login`-URL gelesen und `returnTo` auf den Pfad verkürzt.
- `forwardReturnTo(url: URL): string` — liest `returnTo` aus den Suchparametern und gibt
  `/api/auth/login?returnTo=<encoded>` zurück; fehlt der Parameter, `/api/auth/login`
  ohne Query.

Beide bauen die Query mit `URLSearchParams`, damit das Encoding nicht von Hand
zusammengesetzt wird.

Danach müssen die Tests aus `login-redirect.test.ts` grün sein.

### 3. Die drei Redirect-Stellen auf das Modul umstellen

- `website/src/pages/sdlc/cockpit.astro:12` — `Astro.redirect('/login')` ersetzen durch
  `Astro.redirect(buildLoginRedirect(Astro.url))`.
- `website/src/pages/sdlc/app-catalog.astro` — dieselbe Ersetzung an der dortigen
  `redirect('/login')`-Stelle.
- `website/src/pages/login.astro:7` — `redirect('/api/auth/login', 302)` ersetzen durch
  `redirect(forwardReturnTo(Astro.url), 302)`.

`website/src/pages/api/auth/login.ts` und `website/src/lib/auth.ts` bleiben unverändert.
Sie lesen und speichern `returnTo` bereits korrekt; ihnen fehlte nur die Eingabe.

### 4. sdlc-Root-Stufe in `website/src/middleware.ts`

Eine neue `defineMiddleware`-Stufe, eingereiht **vor** `redirectMiddleware`: liegt
`context.url.pathname` auf `/` und ist `process.env.BUILD_TARGET === 'sdlc'`, dann
`context.redirect('/sdlc/cockpit', 302)`, sonst `next()`.

`process.env` wird **pro Request** gelesen, nicht einmal beim Modul-Laden — sonst ließe
sich die Stufe nicht mit `vi.stubEnv` testen, und der Test aus Aufgabe 1 bliebe rot.

Danach müssen die Tests aus `middleware.test.ts` grün sein, einschließlich des
Positiv-Ankers „does not touch other paths in the sdlc build".

### 5. `BUILD_TARGET` in die runtime-Stage des Dockerfiles

In `website/Dockerfile` in der **runtime**-Stage (ab `FROM node:24-alpine AS runtime`),
direkt neben den vorhandenen `GIT_SHA`/`BUILT_AT`-Zeilen:

```dockerfile
ARG BUILD_TARGET=prod
ENV BUILD_TARGET=${BUILD_TARGET}
```

`ARG` gilt pro Stage. Die Deklaration in der build-Stage macht das `--build-arg` für die
runtime-Stage zu einem stillen No-op — derselbe Defekt lag bei `GIT_SHA`/`BUILT_AT` vor
und wurde mit T002202 behoben (dokumentiert in `website/CLAUDE.md`). Ohne diese Zeilen
wäre die Middleware aus Aufgabe 4 im Container wirkungslos, während sie lokal unter
`task sdlc:dev` einwandfrei funktioniert.

`.github/workflows/build-sdlc-console.yml` übergibt `BUILD_TARGET=sdlc` bereits als
Build-Arg und braucht keine Änderung.

Danach muss `tests/spec/sdlc-cockpit/build-target-runtime-env.bats` vollständig grün sein.

### 6. Verifikation am laufenden Container

Die drei `.astro`-Redirects sind nicht unit-testbar; sie werden gegen den neu gebauten
sdlc-Container geprüft — dieselbe Probe, die den Bug reproduziert hat:

```bash
for p in / /sdlc/cockpit /login; do
  printf "%-16s " "$p"
  curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "http://sdlc.localhost$p"
done
```

Erwartet: `/` → 302 auf `/sdlc/cockpit`; `/sdlc/cockpit` → 302 auf
`/login?returnTo=%2Fsdlc%2Fcockpit`; `/login` → 302 auf
`/api/auth/login?returnTo=%2Fsdlc%2Fcockpit`.

### 7. Abschlussverifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei müssen grün sein, bevor der PR gestellt wird.
