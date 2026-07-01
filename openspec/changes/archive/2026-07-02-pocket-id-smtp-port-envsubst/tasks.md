---
title: "pocket-id-smtp-port-envsubst — Implementation Plan"
ticket_id: T001400
domains: [infra, deploy]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-smtp-port-envsubst — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pocket-ID erhält in beiden Prod-Deploy-Pfaden (`workspace:deploy` ENV≠dev,
`workspace:partial-deploy`) einen tatsächlich substituierten `SMTP_PORT`-Wert statt des
literalen Platzhalter-Strings `"${SMTP_PORT}"`.

**Architecture:** Ein-Zeilen-Fix im bestehenden envsubst-Deploy-Mechanismus (kein neues
System, keine Herleitungslogik): `\$SMTP_PORT` wird an derselben Position wie `\$SMTP_USER`
(zwischen `\$SMTP_HOST` und `\$SMTP_USER`) in die beiden Prod-`ENVSUBST_VARS`-Listen in
`Taskfile.yml` aufgenommen — analog zum T001396-Fix, der dort `\$SMTP_USER` und
`\$POCKET_ID_SMTP_TLS` ergänzt, `\$SMTP_PORT` dabei aber übersehen hat.

**Tech Stack:** go-task (`Taskfile.yml`), `envsubst`, Kustomize, BATS (`tests/spec/`).

## Global Constraints

- Kein neues Env-Var, kein neues Schema-Feld — `SMTP_PORT` existiert bereits in jeder
  `environments/<env>.yaml` (siehe `environments/schema.yaml`) und wird bereits im Dev-Zweig
  von `workspace:deploy` korrekt envsubst't; nur die zwei Prod-Zweige fehlt die Whitelist-
  Eintragung.
- `S1`-Zeilenlimits gelten nicht für `.yml`/`.bats` (nicht in der Extension-Tabelle in
  `docs/code-quality/gates.yaml` → `s1.limits`, kein Baseline-Eintrag für `Taskfile.yml` oder
  `tests/spec/workspace-deploy.bats`) — kein S1-Budget zu prüfen (identisch zur
  T001396-Präzedenz).
- `workspace:partial-deploy` MUSS den Prod-Contract von `workspace:deploy` exakt spiegeln
  (bestehender Kommentar in `Taskfile.yml`: "Mirror workspace:deploy's prod envsubst contract
  EXACTLY") — die Änderung MUSS an beiden Stellen identisch vorgenommen werden.
- Kein Brand-Domain-Literal (`*.mentolder.de`/`*.korczewski.de`) in Code-Snippets (S3).
- Kein Live-Redeploy in diesem Ticket — push-based Deploy-Modell (`task workspace:deploy
  ENV=<brand>`), Redeploy ist ein separater, manueller Schritt nach Merge.

---

## File Structure

```
tests/spec/workspace-deploy.bats   — bereits erweitert (siehe Task 1): 2 neue @test-Fälle
                                      für $SMTP_PORT in beiden Prod-ENVSUBST_VARS-Listen,
                                      rot bestätigt gegen den aktuellen Taskfile.yml-Stand
Taskfile.yml                       — MODIFY: 2 Stellen (workspace:deploy Prod-Zweig Zeile
                                      ~2597, workspace:partial-deploy Zeile ~2762):
                                      $SMTP_PORT in ENVSUBST_VARS aufnehmen
```

---

### Task 1: Failing Test verifizieren (bereits geschrieben)

**Files:**
- Test: `tests/spec/workspace-deploy.bats` (bereits im Worktree vorhanden — dieser Task
  verifiziert nur, dass er wie erwartet rot ist)

**Interfaces:**
- Consumes: nichts (reiner Struktur-Test gegen `Taskfile.yml`, extrahiert die
  `workspace:deploy`- bzw. `workspace:partial-deploy`-Taskblöcke per `sed` und greift
  darin nach `ENVSUBST_VARS=`-Zeilen)
- Produces: 2 neue BATS-Assertions (`$SMTP_PORT` im Prod-Zweig von `workspace:deploy` bzw.
  `workspace:partial-deploy`), die Task 2 grün machen muss; die bereits vorhandenen 6
  Assertions aus T001396 bleiben unverändert grün

Der Test enthält bereits (Auszug, die zwei neuen Fälle):

```bash
@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 1: Test ausführen und roten Zustand bestätigen (RED)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
```
Expected: FAIL — die zwei neuen `$SMTP_PORT`-Tests schlagen fehl ("not ok"), alle 6
bestehenden T001396-Tests bleiben "ok".

- [ ] **Step 2: Commit des failing Tests (falls noch nicht separat committed)**

```bash
git add tests/spec/workspace-deploy.bats
git commit -m "test(infra): add failing test for pocket-id SMTP_PORT envsubst [T001400]"
```

---

### Task 2: `$SMTP_PORT` in beide Prod-`ENVSUBST_VARS`-Listen aufnehmen

**Files:**
- Modify: `Taskfile.yml:2597` (Task `workspace:deploy`, Prod-Zweig, `ENVSUBST_VARS`-Zeile)
- Modify: `Taskfile.yml:2762` (Task `workspace:partial-deploy`, `ENVSUBST_VARS`-Zeile)

**Interfaces:**
- Consumes: bestehende Env-Var `SMTP_PORT` (String, z. B. `"587"`), bereits in jeder
  `environments/<env>.yaml` gesetzt (siehe `environments/schema.yaml`); bereits envsubst't im
  Dev-Zweig von `workspace:deploy` (`Taskfile.yml:2523`).
- Produces: keine neue Variable — nur eine zusätzliche Whitelist-Eintragung in zwei
  bestehenden `ENVSUBST_VARS`-Strings.

- [ ] **Step 1: `$SMTP_PORT` im Prod-Zweig von `workspace:deploy` ergänzen**

In `Taskfile.yml`, Task `workspace:deploy`, Prod-Zweig: die bestehende Zeile

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

ersetzen durch:

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_PORT \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

(Einzige Änderung: `\$SMTP_PORT` wurde zwischen `\$SMTP_HOST` und `\$SMTP_USER` eingefügt —
identische Reihenfolge wie im bereits korrekten Dev-Zweig, wo die `envsubst`-Argumentliste
`... \$SMTP_FROM \$SMTP_HOST \$SMTP_PORT \$SMTP_USER \$POCKET_ID_SMTP_TLS ...` lautet.)

- [ ] **Step 2: `$SMTP_PORT` in `workspace:partial-deploy` spiegeln**

In `Taskfile.yml`, Task `workspace:partial-deploy` (muss laut bestehendem Kommentar "Mirror
workspace:deploy's prod envsubst contract EXACTLY" den Prod-Zweig von `workspace:deploy`
identisch abbilden): dieselbe Zeilenänderung wie in Step 1 vornehmen — die bestehende Zeile

```bash
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

ersetzen durch:

```bash
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_PORT \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

- [ ] **Step 3: Test erneut ausführen und grünen Zustand bestätigen (GREEN)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
```
Expected: PASS — alle 8 Tests "ok" (die 2 neuen `$SMTP_PORT`-Tests plus die 6 bestehenden
T001396-Tests).

- [ ] **Step 4: Kustomize-Rendering lokal gegen Dev-Defaults verifizieren (kein Cluster nötig)**

```bash
POCKET_ID_FRONTEND_URL="http://id.localhost" POCKET_ID_URL="http://pocket-id:1411" \
POCKET_ID_DOMAIN="id.localhost" SMTP_HOST="mailpit.workspace.svc.cluster.local" \
SMTP_PORT="1025" SMTP_USER="noreply@localhost" \
  kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | envsubst '$POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN $SMTP_HOST $SMTP_PORT $SMTP_USER' \
  | grep -A1 'name: SMTP_PORT'
```
Expected: zeigt `value: "1025"` (kein unsubstituierter `${SMTP_PORT}`-Platzhalter).

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "fix(infra): envsubst SMTP_PORT in both prod deploy paths for pocket-id [T001400]"
```

---

### Task 3: Finale Verifikation

**Files:**
- Keine weiteren Dateiänderungen — reiner Verifikations-Task.

**Interfaces:**
- Consumes: alle Änderungen aus Task 1 und Task 2.
- Produces: grünen CI-Äquivalenz-Lauf, aktualisierte Freshness-Artefakte (falls betroffen).

- [ ] **Step 1: CI-Äquivalenz-Gate ausführen**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: PASS — alle drei Commands grün, keine Diffs nach `freshness:regenerate`.

- [ ] **Step 2: Commit (falls `freshness:regenerate` Artefakte verändert hat)**

```bash
git add -A
git commit -m "chore(infra): regenerate freshness artifacts [T001400]" --allow-empty
```
