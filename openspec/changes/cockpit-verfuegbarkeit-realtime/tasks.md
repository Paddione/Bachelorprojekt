---
title: "cockpit-verfuegbarkeit-realtime — Implementation Plan"
ticket_id: T002677
domains: [infra, website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-verfuegbarkeit-realtime — Implementation Plan

_Ticket: T002677_

## File Structure

```
NEW  tests/spec/cockpit-availability/dev-cluster.bats
NEW  tests/spec/cockpit-availability/login-roundtrip.bats
NEW  tests/spec/cockpit-availability/header-live-status.bats
NEW  website/src/lib/sdlc/cockpit-listen-hub.ts
NEW  website/src/lib/sdlc/__tests__/cockpit-listen-hub.test.ts
NEW  website/src/pages/sdlc/api/cockpit/stream.ts
NEW  website/src/pages/sdlc/api/cockpit/stream.test.ts
NEW  website/src/db/migrations/20260804_cockpit_notify_triggers.sql
NEW  docs/sdlc/cockpit-action-inventory.md
NEW  tests/spec/sdlc-cockpit/action-inventory.bats
NEW  tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats
CHG  k3d/sdlc-stack/sdlc-console.yaml         (SITE_URL, Pocket-ID-Client, Env)
CHG  k3d/sdlc-stack/sdlc-ingress.yaml         (Routen, falls nötig)
CHG  k3d/pocket-id-client-seed.yaml           (website-Client-Callback für web.localhost)
CHG  Taskfile.sdlc.yml                        (Feinschliff sdlc:deploy / status)
CHG  .lavish/kit/adapter.js                   (Streams website:true, Live-Status)
CHG  .lavish/kit/action-policy.js             (Aktionsklassifikation)
CHG  website/src/pages/sdlc/cockpit.astro     (Header-Badge, Stream-Init)
CHG  website/src/data/test-inventory.json     (frisch generiert)
```

## Task 1 — RED: Verfügbarkeits- und Login-Tests schreiben

Schreibt die drei BATS-Tests, die das Verfügbarkeitsproblem reproduzieren. Sie müssen auf
dem aktuellen Branch FEHLSCHLAGEN.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/cockpit-availability/
# expected: FAIL (red — cluster fehlt / Login bricht ab / Badge zeigt Fixtures)
```

- `dev-cluster.bats`: prüft, dass `k3d cluster list` `mentolder-dev` enthält und
  `GET http://sdlc.localhost/sdlc/cockpit` nicht mit Connection-Refused endet.
- `login-roundtrip.bats`: prüft, dass der OAuth-Flow für `website` auf
  `http://web.localhost/api/auth/callback` antwortet und kein
  *"OAuth 2.0 Client does not exist"* auftritt.
- `header-live-status.bats`: prüft, dass das Cockpit-Header-Badge nicht "Fixtures (K1)" zeigt,
  sobald der Adapter Livedaten liefert.

## Task 2 — GREEN: mentolder-dev-Cluster + SDLC-Stack deployen

Führt den vorhandenen Deployment-Pfad aus und behebt, was dabei bricht.

```bash
task sdlc:cluster:create
task sdlc:deploy
# expected: GREEN — Deployment sdlc-console rolled out, /sdlc/cockpit antwortet
```

- `sdlc:cluster:create` (k3d `mentolder-dev`) und `sdlc:deploy` (Kustomize
  `k3d/sdlc-stack` + envsubst + kubectl apply) ausführen; Fehler im Stack fixen.
- Kontext-Hygiene: nach Cluster-Erstellung auf `k3d-mentolder-dev` wechseln bzw. `--context`
  explizit setzen; den Default-Kontext nicht versehentlich überschreiben.

## Task 3 — GREEN: Login-Pfad fixen (Pocket-ID-Client)

Registriert den `website`-OAuth-Client mit korrektem Callback, damit der Login-Roundtrip
funktioniert.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/cockpit-availability/login-roundtrip.bats
# expected: GREEN
```

- `k3d/pocket-id-client-seed.yaml`: `website`-Client-Callback auf
  `http://web.localhost/api/auth/callback` erweitern (zusätzlich zu prod-Callbacks).
- `k3d/sdlc-stack/sdlc-console.yaml` + Dev-Env: `SITE_URL=http://web.localhost` konsistent
  setzen (Dev-`.env` in `website/`), damit Authorization-Code-Flow den Callback trifft.
- Seed-Job erneut ausführen bzw. Pocket-ID-Client per API nachtragen; Laufzeit-Registrierung
  im laufenden Pocket ID abgleichen (T001435 Cross-Namespace-Drift beachten).

## Task 4 — GREEN: Header-Badge auf Livedaten

Behebt das Fake-Badge *"Fixtures (K1)"*.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/cockpit-availability/header-live-status.bats
# expected: GREEN
```

- `.lavish/kit/adapter.js`: Datenmodus (Fixtures vs. Live) sauber signalisieren.
- `website/src/pages/sdlc/cockpit.astro`: Status-Element an den realen Adapter-Status
  binden statt an einen statischen String.

## Task 5 — RED: Cockpit-Realtime-Tests (SSE + Aktions-Inventur)

Schreibt die Test-Vorderseite für den Realtime-Teil, analog T002643.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/
# expected: FAIL (red — SSE-Endpunkt und Aktionsfreibschaltung fehlen)
```

- `tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats`: SDLC-Pfade des Adapters.
- `tests/spec/sdlc-cockpit/action-inventory.bats`: Aktions-Endpunkte erreichbar.
- `website/src/lib/sdlc/__tests__/cockpit-listen-hub.test.ts` (vitest): LISTEN-Hub.

## Task 6 — GREEN: LISTEN/NOTIFY-SSE-Push

Implementiert den Realtime-Push-Pfad.

```bash
cd website && pnpm test:unit
tests/spec/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/
# expected: GREEN
```

- `website/src/db/migrations/20260804_cockpit_notify_triggers.sql`: Trigger auf
  `tickets`/Audit/Factory-Phasen, die `NOTIFY` auf Cockpit-Kanäle senden.
- `website/src/lib/sdlc/cockpit-listen-hub.ts`: Long-lived LISTEN-Client + SSE-Fanout.
- `website/src/pages/sdlc/api/cockpit/stream.ts`: SSE-Endpoint mit Admin-Session-Auth
  (Muster: `factory-floor/stream.ts`).
- `.lavish/kit/adapter.js`: Streams als `website:true` freigeben, Panels auf Push
  umstellen; Polling nur noch als Fallback für nicht-push-fähige Quellen.

## Task 7 — GREEN: SDLC-Aktionsknöpfe + Audit

Schaltet die Aktionen frei und belegt sie.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/action-inventory.bats
# expected: GREEN
```

- `docs/sdlc/cockpit-action-inventory.md`: jede freigeschaltete Aktion mit
  `action-policy.js`-Klassifikation dokumentieren.
- Audit-Logging in `tickets.cockpit_audit` für Schreibaktionen verdrahten.
- `.lavish/kit/action-policy.js` entsprechend ergänzen.

## Verify (RED → GREEN)

- [ ] **Task 1 (RED):** Verfügbarkeits-BATS-Tests schlagen fehl, weil
      Cluster fehlt / Login bricht / Badge lügt.

```bash
tests/spec/lib/bats-core/bin/bats tests/spec/cockpit-availability/
# expected: FAIL (red — der Zustand ist heute tatsächlich kaputt)
```

- [ ] **Task 2–4 (GREEN):** Cluster deployt, Login funktioniert, Badge zeigt Livedaten.

- [ ] **Task 5–7 (GREEN):** SSE-Push und Aktionsknöpfe sind implementiert und per
      BATS/vitest belegt.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
