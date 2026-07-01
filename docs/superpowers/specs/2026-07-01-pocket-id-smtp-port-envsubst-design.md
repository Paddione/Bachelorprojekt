---
ticket_id: T001400
plan_ref: null
status: active
date: 2026-07-01
---

# Pocket-ID SMTP_PORT unsubstituiert in Prod — Design Spec

## Problem

Direkte Fortsetzung von T001396 (PR #2408, gemergt): dort wurden `$SMTP_USER` und die neue
`POCKET_ID_SMTP_TLS`-Variable in die `ENVSUBST_VARS`-Listen der beiden Prod-Deploy-Tasks in
`Taskfile.yml` ergänzt (`workspace:deploy` Prod-Zweig ~Zeile 2585, `workspace:partial-deploy`
~Zeile 2719). Dabei wurde übersehen, dass `$SMTP_PORT` in genau denselben beiden Listen
ebenfalls fehlt — die T001396-Design-Spec ging fälschlich davon aus, `SMTP_PORT` sei "bereits
korrekt verdrahtet" (siehe `docs/superpowers/specs/2026-07-01-pocket-id-smtp-wiring-design.md`,
Abschnitt "Explizit außerhalb des Scopes").

`k3d/pocket-id.yaml` (Zeile 187-188) setzt den Container-Env `SMTP_PORT` als literalen
envsubst-Platzhalter:
```yaml
- name: SMTP_PORT
  value: "${SMTP_PORT}"
```

Der Dev-Deploy-Pfad (`Taskfile.yml:2523`, Task `workspace:deploy` ENV=dev, `kustomize build`
Pipe) listet `\$SMTP_PORT` korrekt in seiner envsubst-Liste. Die beiden Prod-Deploy-Pfade tun
das nicht:

- `workspace:deploy`, Prod-Zweig, `ENVSUBST_VARS` Zeile 2597:
  `ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"`
  — kein `\$SMTP_PORT`.
- `workspace:partial-deploy`, `ENVSUBST_VARS` Zeile 2762: identische Zeile, identische Lücke.

Ergebnis: der Pocket-ID-Pod in Prod (beide Brands) bekommt den literalen String
`"${SMTP_PORT}"` als SMTP-Port injiziert statt eines numerischen Werts (z. B. `587`).
Live bestätigt (kubectl, heute) auf **mentolder UND korczewski**.

Da Pocket-ID den Port zur STARTTLS-Handshake-Entscheidung braucht, ist der SMTP-Versand in
Prod weiterhin kaputt, obwohl T001396 `SMTP_USER` und `POCKET_ID_SMTP_TLS` bereits korrekt
verdrahtet hat.

## Ziel

`$SMTP_PORT` wird in beiden Prod-`ENVSUBST_VARS`-Listen (`workspace:deploy`,
`workspace:partial-deploy`) korrekt substituiert — analog und an derselben Position wie
`$SMTP_USER` im T001396-Fix. Kein neues Feld, keine neue Herleitung, kein Scope über das
Envsubst-Wiring hinaus.

## Entscheidungen (Root-Cause bereits geklärt — kein tiefes Brainstorming nötig)

1. **Fix-Pfad, nicht Feature-Pfad.** Nachweisbarer Regressions-/Übersehens-Bug analog
   T001396, unter Bug-Ticket T001400 gemäß Bug-Triage-Konvention (CFR-Gate G-DORA03).
2. **Mechanische Ein-Variablen-Ergänzung.** `\$SMTP_PORT` wird an derselben Stelle wie
   `\$SMTP_USER` eingefügt (zwischen `\$SMTP_HOST` und `\$SMTP_USER`, konsistent mit der
   Reihenfolge im Dev-Zweig `\$SMTP_FROM \$SMTP_HOST \$SMTP_PORT \$SMTP_USER`). Keine
   Herleitungslogik nötig — `$SMTP_PORT` existiert bereits als Env-Var (`environments/schema.yaml`),
   nur der envsubst-Aufruf hat sie in den zwei Prod-Zweigen nicht in der Whitelist.
3. **Test-SSOT bleibt `tests/spec/workspace-deploy.bats`.** Kein neues Testfile — Erweiterung
   der bestehenden Datei, analog zu den bereits vorhandenen `$SMTP_USER`/
   `$POCKET_ID_SMTP_TLS`-Assertions (gleiches `_workspace_deploy_block`/
   `_workspace_partial_deploy_block`-Extraktionsmuster).

## Scope

**Geändert:**
- `Taskfile.yml`, Task `workspace:deploy`, Prod-Zweig `ENVSUBST_VARS` (~Zeile 2597):
  `\$SMTP_PORT` ergänzen.
- `Taskfile.yml`, Task `workspace:partial-deploy`, `ENVSUBST_VARS` (~Zeile 2762): identische
  Ergänzung — muss den Prod-Contract von `workspace:deploy` weiterhin exakt spiegeln.
- `tests/spec/workspace-deploy.bats` — zwei neue `@test`-Fälle (`workspace:deploy prod
  ENVSUBST_VARS includes \$SMTP_PORT`, `workspace:partial-deploy ENVSUBST_VARS includes
  \$SMTP_PORT`), rot vor dem Fix, grün danach.
- `openspec/specs/workspace-deploy.md` — Delta-Requirement/Scenario für die vollständige
  SMTP_PORT-Substitution in Prod ergänzt (Parent-SSOT bleibt `workspace-deploy`, siehe
  Delta-Spec-Konvention T001304).

**Explizit außerhalb des Scopes:**
- `k3d/pocket-id.yaml` — der Platzhalter `${SMTP_PORT}` ist bereits korrekt, keine
  Manifest-Änderung nötig.
- Dev-Zweig von `workspace:deploy` — bereits korrekt, nur Regressions-Absicherung via
  bestehendem `no regression`-Testmuster (kein neuer Test nötig, da T001396 das bereits für
  `$SMTP_USER` abdeckt; `$SMTP_PORT` ist im Dev-Zweig unstrittig).
- Kein Live-Redeploy in diesem Ticket — push-based Deploy-Modell, Redeploy ist ein separater
  Schritt nach Merge.
- Keine Herleitungslogik/Schema-Änderung — `SMTP_PORT` ist bereits ein bestehendes,
  korrekt befülltes Env-Var.

## Verifikation

- Failing Tests zuerst (rot): neue BATS-Assertions scheitern gegen den aktuellen
  `Taskfile.yml`-Stand (fehlendes `\$SMTP_PORT`).
- Nach dem Fix (dev-flow-execute, separater Schritt): `task test:changed`,
  `task freshness:regenerate`, `task freshness:check` grün.
- Manuelle Verifikation nach Deploy (optional, außerhalb der PR): Pod-Env von Pocket-ID auf
  beiden Brands prüfen (`kubectl exec ... -- env | grep SMTP_PORT`) — erwartet numerischer
  Wert statt `${SMTP_PORT}`.
