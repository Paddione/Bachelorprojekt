# Proposal: cockpit-verfuegbarkeit-realtime

## Why

Das SDLC-Cockpit (/sdlc/cockpit) ist heute **komplett unerreichbar** — es gibt keinen
einzigen Pfad, über den ein Admin die Fläche aufrufen kann:

1. **Prod-Build schließt es aus.** `BUILD_TARGET=prod` filtert per Build-Target-Integration
   (T002624, ADR-006) alle `/sdlc/`-Routen aus dem Website-Manifest. `mentolder-web`
   liefert das Cockpit also gar nicht aus.
2. **Der Ziel-Cluster fehlt.** Das SDLC-Console-Image (`BUILD_TARGET=sdlc`, gebaut über
   `build-sdlc-console.yml`) baut auf jedem main-Push grün — aber der dazugehörige k3d-Cluster
   `mentolder-dev` existiert nicht (`k3d cluster list` zeigt nur `korczewski`). Der
   Deployment-Pfad (`Taskfile.sdlc.yml` `sdlc:cluster:create` + `sdlc:deploy`,
   `k3d/sdlc-stack/`) wurde nie ausgeführt.
3. **Der lokale Login-Pfad ist gebrochen.** `pnpm dev` (:4321) rendert die Seite, aber der
   OAuth-Redirect auf `auth.localhost` endet in *"OAuth 2.0 Client does not exist"* — die
   Dev-SITE_URL (`http://web.localhost`) und der Callback (`/api/auth/callback`) sind im
   laufenden Pocket ID nicht als Client registriert.

Parallel liegt T002643 (Cockpit-Realtime: LISTEN/NOTIFY-SSE statt Polling + SDLC-Aktionsknöpfe)
als `plan_staged`-Plan vor, wurde aber nie umgesetzt. Der Plan verbessert das Cockpit dort
weiter, wo es bereits funktioniert — hilft aber nichts, solange die Fläche gar nicht erreichbar ist.

## What

Der Plan kombiniert Verfügbarkeit und Verbesserung in einer Auslieferung:

**A. Cockpit verfügbar machen**
- `mentolder-dev`-k3d-Cluster anlegen (`sdlc:cluster:create`) und SDLC-Stack deployen
  (`sdlc:deploy`).
- Login-Pfad fixen: OAuth-Client `website` (Callback `http://web.localhost/api/auth/callback`)
  im laufenden Pocket ID registrieren, `SITE_URL` konsistent setzen.
- Erreichbarkeit nachweisen: BATS-Test, der `GET /sdlc/cockpit` bis zum 200/302 und den
  Login-Roundtrip prüft (Test statt Behauptung).
- Den fehlerhaften Header-Status *"Fixtures (K1)"* auf die realen Livedaten (K4) korrigieren.

**B. Cockpit verbessern (Kern aus T002643)**
- PostgreSQL `LISTEN/NOTIFY` als Event-Quelle für DB-gestützte Domänen (Tickets, Audit,
  Factory-Phasen); SSE-Fanout auf der Website-API (`/api/admin/cockpit/stream`) mit
  Admin-Session-Auth. Polling bleibt nur für nicht-push-fähige Quellen (Pods, CI, Modell-Health).
- SDLC-Aktionsknöpfe: die vorhandenen POST-Endpunkte freischalten, Aktionen dokumentieren
  (Inventur), Erreichbarkeit per Test belegen, Audit-Logging in `tickets.cockpit_audit`.

Scope-Grenze: Cockpit bleibt Development-only (T002624). Kein Prod-Cockpit, keine Prod-Routen.

_Ticket: T002677_
