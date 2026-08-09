# Proposal: sdlc-login-404-root

## Why

Der Login in die SDLC-Console endet auf einer nackten Astro-Default-404-Seite. Wer
`http://sdlc.localhost/sdlc/cockpit` aufruft und sich anmeldet, landet nach dem OIDC-Callback
nicht im Cockpit, sondern auf `/` — und dort auf Astros eingebauter Fehlerseite mit dem Hinweis
`Path: /`. Die Console ist damit über den regulären Login-Weg unerreichbar.

Zwei Ursachen greifen ineinander. Beide sind belegt, nicht angenommen:

**1. Das Redirect-Ziel überlebt die Login-Kette nicht.** `sdlc/cockpit.astro` leitet
unauthentifizierte Aufrufe auf `/login` um, **ohne** das ursprüngliche Ziel mitzugeben.
`login.astro` reicht ebenfalls nichts weiter an `/api/auth/login`, wo dann der Fallback
`|| '/'` greift. `getLoginUrl` legt folglich `/` im `oidcStateStore` ab, und der Callback
leitet nach erfolgreichem Login genau dorthin. Die returnTo-Maschinerie existiert vollständig
und korrekt (`getLoginUrl`, `consumeReturnTo`, `resolveReturnTo` samt Open-Redirect-Schutz) —
sie wird von diesem Pfad nur nie gefüttert.

**2. Der Fallback `/` existiert im sdlc-Build nicht.** `src/integrations/build-target.mjs`
entfernt bei `BUILD_TARGET=sdlc` alle Routen, die weder unter `/sdlc/` liegen noch in der
Infra-Allowlist stehen. `index.astro` und `404.astro` erfüllen beides nicht. Deshalb ist `/`
ein 404, und deshalb erscheint Astros **Default**-Fehlerseite statt der gebrandeten.

Im prod-Build bleibt der Defekt unsichtbar, weil `/` dort die Startseite ist. Erst das
Route-Filtering aus ADR-006 Etappe 1 (T002624) verwandelt den Zielverlust in einen harten 404.

Reproduktion gegen den laufenden `sdlc-console`-Pod (k3d-Dev-Cluster):

```
/                 404
/sdlc/cockpit     302 -> /login
/login            302 -> /api/auth/login
/api/auth/login   302 -> auth.localhost/authorize?...&state=<nonce>   (hinterlegt: "/")
```

## What

Der Fix setzt auf zwei Ebenen an — an der Ursache und als Auffangnetz dahinter.

**Ebene 1 — das Ziel überlebt die Kette.** Die beiden SDLC-Seiten, die selbst auf `/login`
umleiten (`cockpit.astro`, `app-catalog.astro`), geben ihr Ziel als `returnTo` mit, inklusive
Query-String — damit bleibt die Tab-Auswahl erhalten (`?tab=analytics` und Verwandte, auf die
die Redirect-Map aus `/admin/dora` verweist). `login.astro` reicht den Parameter durch.
`api/auth/login.ts` und `lib/auth.ts` bleiben unverändert; ihr Open-Redirect-Schutz greift
unverändert weiter.

**Ebene 2 — `/` ist keine Sackgasse mehr.** Eine neue Middleware-Stufe leitet im sdlc-Build
`/` auf `/sdlc/cockpit` um. Damit landet auch ein fail-closed zurückgefallener `returnTo` im
Cockpit statt im Nichts. Voraussetzung dafür ist, dass `BUILD_TARGET` zur **Laufzeit** im
Container sichtbar ist — heute setzt `website/Dockerfile` es nur in der `build`-Stage, die
`runtime`-Stage übernimmt es nicht. Ohne diese eine Zeile wäre der Redirect stiller toter Code,
der lokal unter `task sdlc:dev` einwandfrei funktioniert und nur im Image versagt.

`build-target.mjs` und `404.astro` bleiben bewusst unangetastet: `404.astro` ist keine generische
Fehlerseite, sondern eine gebrandete Wartungsseite mit vollem `Layout.astro`. Sie in den
sdlc-Build zu ziehen, brächte Marketing-Layout und die sachlich falsche Meldung
„Wir befinden uns derzeit in Wartungsarbeiten" in eine interne Entwickler-Console.

_Ticket: T003036_
