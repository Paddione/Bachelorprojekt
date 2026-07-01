# Proposal: pocket-id-smtp-port-envsubst

## Why

Direkte Fortsetzung von T001396 (PR #2408, gemergt): dort wurden `$SMTP_USER` und die neue
`POCKET_ID_SMTP_TLS`-Variable in die `ENVSUBST_VARS`-Listen der beiden Prod-Deploy-Tasks in
`Taskfile.yml` ergänzt (`workspace:deploy` Prod-Zweig ~Zeile 2597, `workspace:partial-deploy`
~Zeile 2762). Dabei wurde übersehen, dass `$SMTP_PORT` in genau denselben beiden Listen
ebenfalls fehlt, obwohl `k3d/pocket-id.yaml` es als literalen envsubst-Platzhalter
(`value: "${SMTP_PORT}"`) referenziert. Der Dev-Deploy-Pfad (`Taskfile.yml:2523`) envsubst't
`$SMTP_PORT` bereits korrekt.

Ergebnis: der Pocket-ID-Pod in Prod (beide Brands, mentolder UND korczewski) bekommt den
literalen String `"${SMTP_PORT}"` als SMTP-Port injiziert statt eines numerischen Werts
(z. B. `587`). Live bestätigt per `kubectl` auf beiden Brands. Pocket-ID braucht den Port zur
STARTTLS-Handshake-Entscheidung — der SMTP-Versand in Prod bleibt dadurch kaputt, obwohl
T001396 `SMTP_USER` und `POCKET_ID_SMTP_TLS` bereits korrekt verdrahtet hat.

Dies ist ein Regressions-/Übersehens-Bug (T001400, Bug-Triage-Konvention CFR-Gate G-DORA03),
keine Erweiterung.

## What

- `$SMTP_PORT` in beide Prod-`ENVSUBST_VARS`-Listen (`workspace:deploy` Prod-Zweig,
  `workspace:partial-deploy`) aufnehmen, an derselben Position wie `$SMTP_USER` im
  T001396-Fix (zwischen `$SMTP_HOST` und `$SMTP_USER`, konsistent zur Reihenfolge im
  bereits korrekten Dev-Zweig).
- Zwei neue failing BATS-Assertions in `tests/spec/workspace-deploy.bats` (bereits
  geschrieben, rot bestätigt), die die fehlende Substitution reproduzieren.
- Delta-Spec-Ergänzung gegen die Parent-SSOT `openspec/specs/workspace-deploy.md`
  (Requirement "Pocket-ID erhält vollständige SMTP-Konfiguration in jedem Deploy-Pfad",
  aus T001396) um ein explizites SMTP_PORT-Scenario.
- Explizit außerhalb des Scopes: `k3d/pocket-id.yaml` (Platzhalter bereits korrekt), Dev-Zweig
  von `workspace:deploy` (bereits korrekt), keine Herleitungslogik/Schema-Änderung
  (`SMTP_PORT` ist ein bestehendes, korrekt befülltes Env-Var — nur der envsubst-Aufruf hat
  es in zwei Prod-Zweigen nicht in der Whitelist), kein Live-Redeploy in diesem Ticket
  (push-based Deploy-Modell, Redeploy ist ein separater Schritt nach Merge).

_Ticket: T001400_
