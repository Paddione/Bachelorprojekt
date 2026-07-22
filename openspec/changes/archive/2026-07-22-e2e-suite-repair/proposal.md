# Proposal: e2e-suite-repair

## Why

Der vollständige E2E-Lauf (`task test:e2e ENV=mentolder`) endete mit 150 failed / 4 flaky.
Die Triage (2026-07-22, live verifiziert) reduziert das auf fünf Root-Cause-Cluster:

1. **Auth-Kaskade (~110 Tests):** `/api/auth/e2e-login` matcht Usernamen case-sensitiv;
   der Pocket-ID-Admin heißt `Paddione`, die Test-Harness sendet `paddione` →
   `404 user not found` → jeder authentifizierte Test (Setup-Projekte, website,
   systemtest, mentolder) scheitert im Login-Timeout.
2. **PROD_DOMAIN-Env-Leakage (4 Unit-Tests):** `health-assertions.test.ts` testet den
   Dev-Modus (`test.fixme`-Pfad), räumt aber `PROD_DOMAIN` nicht auf — der
   `test:e2e`-Wrapper exportiert die Variable und kippt die Assertions in den Prod-Modus.
3. **oauth2-proxy vor Health/Assets (fa-27, fa-13, brett-mannequin):**
   `brett.mentolder.de/healthz` und `docs.mentolder.de` leiten unauthentifizierte
   Requests auf `auth.mentolder.de` um; die `[services]`-Tests sind bewusst ohne Login.
4. **notify_push-Probe (fa-ios T2):** Der Daemon läuft (`/push/test/cookie` → 400),
   aber der Test probt `/push` (Root) — dort hat notify_push keinen Handler (404).
5. **korczewski-Content-Drift + brett-mannequin:** Live-Nav enthält „Über mich"/„Notizen"
   nicht mehr; weitere Assertions (Service-Cards, Timeline, Footer, Subpages) driften
   analog. brett-mannequin hängt zusätzlich an Cluster 3.

## What

- `e2e-login.ts`: Username/E-Mail-Match case-insensitiv (exakter Treffer hat Vorrang);
  neuer Vitest `e2e-login.test.ts` (RED bereits committed) wird grün.
- `health-assertions.test.ts`: `PROD_DOMAIN` pro Testfall explizit setzen/löschen und
  in `finally`/`afterEach` wiederherstellen — Suite wird env-unabhängig deterministisch.
- oauth2-proxy (brett, docs): `--skip-auth-routes` für exakt verankerte, datenfreie
  Pfade (`^/healthz$`, statische Assets); fa-27-Daten-API-Tests wandern in den
  authentifizierten `brett-mentolder`-Kontext statt Endpoints freizugeben.
- `fa-ios-talk.spec.ts`: notify_push-Probe auf einen echten Daemon-Endpoint umstellen.
- korczewski-Homepage-Tests: Assertions gegen den tatsächlichen Live-Content abgleichen
  (Diagnose-first; Test ODER Content fixen, je Befund).

_Ticket: T002068_
