---
title: "pocket-id-smtp-wiring — Implementation Plan"
ticket_id: T001396
domains: [infra]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-smtp-wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pocket-ID nutzt in Dev, Prod (mentolder + korczewski) und Partial-Deploy dieselben
SMTP-Credentials korrekt — `SMTP_USER` wird auch in Prod tatsächlich substituiert, und ein neuer
`SMTP_TLS`-Container-Env sorgt dafür, dass Pocket-ID STARTTLS gegen `smtp.mailbox.org:587` spricht
statt Klartext.

**Architecture:** Zwei Bugfixes im bestehenden envsubst-Deploy-Mechanismus (kein neues System):
(1) `$SMTP_USER` in die beiden Prod-`ENVSUBST_VARS`-Listen in `Taskfile.yml` aufnehmen, die es
bisher nicht enthalten. (2) Eine neue Variable `POCKET_ID_SMTP_TLS` wird an drei Stellen im
Taskfile aus `SMTP_SECURE`+`SMTP_PORT` hergeleitet (Muster identisch zu `MAIL_FROM_LOCAL`/
`MAIL_FROM_DOMAIN`, die schon aus `SMTP_FROM` abgeleitet werden) und in `k3d/pocket-id.yaml` als
neuer Container-Env `SMTP_TLS` verdrahtet.

**Tech Stack:** Kustomize, `envsubst`, go-task (`Taskfile.yml`), BATS (`tests/spec/`).

## Global Constraints

- Kein neues Pflichtfeld in `environments/*.yaml` — `POCKET_ID_SMTP_TLS` wird ausschließlich im
  Taskfile hergeleitet (SSOT-Entscheidung aus dem Brainstorming, User-bestätigt).
- Kein neues Secret, keine neue Secret-Quelle — `SMTP_PASSWORD`/`SMTP_USER`/`SMTP_HOST`/
  `SMTP_PORT`/`SMTP_FROM` bleiben in `workspace-secrets` bzw. den Env-Dateien.
- `S1`-Zeilenlimits gelten nicht für `.yml`/`.yaml`/`.bats` (nicht in der Extension-Tabelle in
  `docs/code-quality/gates.yaml` → `s1.limits`) — für `Taskfile.yml` (4492 Zeilen) und
  `k3d/pocket-id.yaml` (295 Zeilen) ist kein S1-Budget zu prüfen.
- `workspace:partial-deploy` MUSS den Prod-Contract von `workspace:deploy` exakt spiegeln
  (bestehender Kommentar in `Taskfile.yml`: "Mirror workspace:deploy's prod envsubst contract
  EXACTLY") — jede Änderung an einer Stelle MUSS an der anderen gespiegelt werden.
- Kein Brand-Domain-Literal (`*.mentolder.de`/`*.korczewski.de`) in Code-Snippets — alle Werte
  kommen aus `environments/*.yaml` bzw. werden generisch hergeleitet (S3).

---

## File Structure

```
tests/spec/workspace-deploy.bats   — bereits angelegt (siehe Task 1), erweitert SSOT-Testabdeckung
                                      für openspec/specs/workspace-deploy.md
k3d/pocket-id.yaml                 — MODIFY: neuer Container-Env SMTP_TLS
Taskfile.yml                       — MODIFY: 3 Stellen (workspace:deploy dev-Zweig,
                                      workspace:deploy prod-Zweig, workspace:partial-deploy):
                                      POCKET_ID_SMTP_TLS herleiten + in ENVSUBST_VARS/envsubst-Liste
                                      aufnehmen; $SMTP_USER in beide Prod-ENVSUBST_VARS-Listen
```

---

### Task 1: Failing Test verifizieren (bereits geschrieben)

**Files:**
- Test: `tests/spec/workspace-deploy.bats` (bereits im Worktree vorhanden, siehe unten für
  vollständigen Inhalt — dieser Task verifiziert nur, dass er wie erwartet rot ist)

**Interfaces:**
- Consumes: nichts (reiner Struktur-Test gegen `Taskfile.yml` und `k3d/pocket-id.yaml`)
- Produces: 5 BATS-Assertions, die Task 2 und Task 3 grün machen müssen; 1 Regressions-Assertion
  (Dev-Zweig `$SMTP_USER`), die bereits grün ist und grün bleiben muss

Der Test existiert bereits im Worktree mit folgendem Inhalt:

```bash
#!/usr/bin/env bats
# tests/spec/workspace-deploy.bats
# SSOT: openspec/specs/workspace-deploy.md
# Covers T001396: Pocket-ID SMTP wiring (SMTP_USER unsubstituted in prod,
# missing POCKET_ID_SMTP_TLS derivation).
# Uses simple [ ... ] assertions (matches tests/spec/* convention).

load 'test_helper'

TASKFILE="${PROJECT_DIR}/Taskfile.yml"
POCKET_ID_MANIFEST="${PROJECT_DIR}/k3d/pocket-id.yaml"

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "k3d/pocket-id.yaml wires an SMTP_TLS container env" {
  run grep -c 'name: SMTP_TLS' "$POCKET_ID_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "workspace:deploy dev branch still envsubsts \$SMTP_USER (no regression)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep 'kustomize build k3d/' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 1: Test ausführen und roten Zustand bestätigen (RED)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
# expected: FAIL — Tests 1-5 schlagen fehl ("not ok"), Test 6 ("no regression") ist "ok"
```

- [ ] **Step 2: Commit des failing Tests**

```bash
git add tests/spec/workspace-deploy.bats
git commit -m "test(infra): add failing test for pocket-id SMTP wiring [T001396]"
```

---

### Task 2: `SMTP_TLS`-Herleitung im Taskfile + Container-Env in `k3d/pocket-id.yaml`

**Files:**
- Modify: `k3d/pocket-id.yaml:184-197` (Container-Env-Block der Pocket-ID-Deployment-Spec)
- Modify: `Taskfile.yml:2490-2511` (Task `workspace:deploy`, dev-Zweig)
- Modify: `Taskfile.yml:2584-2638` (Task `workspace:deploy`, prod-Zweig)
- Modify: `Taskfile.yml:2718-2750` (Task `workspace:partial-deploy`)

**Interfaces:**
- Consumes: bestehende Env-Vars `SMTP_SECURE` (bool-String `"true"`/`"false"`), `SMTP_PORT`
  (String, z. B. `"587"`, `"1025"`), beide bereits in jeder `environments/<env>.yaml` gesetzt
  (siehe `environments/schema.yaml:105-137`).
- Produces: neue Shell-Variable `POCKET_ID_SMTP_TLS` (Werte: `none`|`starttls`|`tls`), exportiert
  in allen drei Deploy-Codepfaden vor dem jeweiligen `envsubst`-Aufruf; neuer Container-Env
  `SMTP_TLS` in `k3d/pocket-id.yaml`, literal envsubst't wie `SMTP_HOST`/`SMTP_PORT`.

- [ ] **Step 1: `SMTP_TLS`-Env in `k3d/pocket-id.yaml` ergänzen**

In `k3d/pocket-id.yaml`, im Container-Env-Block des Pocket-ID-Deployments (direkt nach dem
bestehenden `SMTP_PORT`-Eintrag, vor `SMTP_USER`), folgenden Env-Eintrag einfügen:

```yaml
            - name: SMTP_HOST
              value: "${SMTP_HOST}"
            - name: SMTP_PORT
              value: "${SMTP_PORT}"
            - name: SMTP_TLS
              value: "${POCKET_ID_SMTP_TLS}"
            - name: SMTP_USER
              value: "${SMTP_USER}"
```

(Die drei bestehenden Zeilen `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER` bleiben unverändert — nur die
neue `SMTP_TLS`-Zeile wird dazwischen eingefügt.)

- [ ] **Step 2: Herleitungs-Snippet definieren (wird in Task 2 Steps 3-5 dreifach wiederverwendet)**

Dieses Shell-Snippet wird an drei Stellen im Taskfile eingefügt (siehe Steps 3-5). Es ist bewusst
identisch an allen drei Stellen, damit `workspace:deploy` und `workspace:partial-deploy` garantiert
denselben Wert produzieren (Global Constraint: Prod-Contract muss gespiegelt werden):

```bash
# POCKET_ID_SMTP_TLS: von SMTP_SECURE + SMTP_PORT hergeleitet (Pocket-ID kennt kein
# SMTP_SECURE-Bool, sondern SMTP_TLS=none|starttls|tls). secure=true -> implizites TLS
# (z.B. Port 465); Port 587 ist bei allen aktuell konfigurierten Envs (mentolder,
# korczewski, staging) STARTTLS gegen mailbox.org; alles andere (z.B. Mailpit dev auf
# Port 1025) bleibt unverschluesselt.
if [ "${SMTP_SECURE:-false}" = "true" ]; then
  export POCKET_ID_SMTP_TLS="tls"
elif [ "${SMTP_PORT:-}" = "587" ]; then
  export POCKET_ID_SMTP_TLS="starttls"
else
  export POCKET_ID_SMTP_TLS="none"
fi
```

- [ ] **Step 3: Herleitung + Var-Liste im dev-Zweig von `workspace:deploy` ergänzen**

In `Taskfile.yml`, Task `workspace:deploy`, im `if [ "{{.ENV}}" = "dev" ]`-Block: das
Herleitungs-Snippet aus Step 2 direkt vor dem `POCKET_ID_FRONTEND_URL="..." \`-Export-Block
(vor Zeile `POCKET_ID_FRONTEND_URL="${POCKET_ID_FRONTEND_URL:-http://id.localhost}" \`) einfügen,
und `\$POCKET_ID_SMTP_TLS` zur `envsubst "..."`-Argumentliste hinzufügen:

```bash
          # POCKET_ID_SMTP_TLS: von SMTP_SECURE + SMTP_PORT hergeleitet (Pocket-ID kennt kein
          # SMTP_SECURE-Bool, sondern SMTP_TLS=none|starttls|tls). secure=true -> implizites TLS
          # (z.B. Port 465); Port 587 ist bei allen aktuell konfigurierten Envs (mentolder,
          # korczewski, staging) STARTTLS gegen mailbox.org; alles andere (z.B. Mailpit dev auf
          # Port 1025) bleibt unverschluesselt.
          if [ "${SMTP_SECURE:-false}" = "true" ]; then
            export POCKET_ID_SMTP_TLS="tls"
          elif [ "${SMTP_PORT:-}" = "587" ]; then
            export POCKET_ID_SMTP_TLS="starttls"
          else
            export POCKET_ID_SMTP_TLS="none"
          fi
          SYSTEMTEST_LOOP_ENABLED="${SYSTEMTEST_LOOP_ENABLED:-false}" \
          LLM_ENABLED="${LLM_ENABLED:-false}" \
          LLM_RERANK_ENABLED="${LLM_RERANK_ENABLED:-false}" \
          LLM_HOST_IP="${LLM_HOST_IP:-172.17.0.1}" \
          LLM_ROUTER_URL="${LLM_ROUTER_URL:-http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234}" \
          LLM_EMBED_URL="${LLM_EMBED_URL:-http://llm-gateway-embed.workspace.svc.cluster.local:8081}" \
          POCKET_ID_FRONTEND_URL="${POCKET_ID_FRONTEND_URL:-http://id.localhost}" \
          POCKET_ID_URL="${POCKET_ID_URL:-http://pocket-id:1411}" \
          POCKET_ID_DOMAIN="${POCKET_ID_DOMAIN:-id.localhost}" \
            kustomize build k3d/ --load-restrictor=LoadRestrictionsNone | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$BRAND_ID \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$SYSTEMTEST_LOOP_ENABLED \$ARENA_WS_URL \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_HOST_IP \$LLM_ROUTER_URL \$LLM_EMBED_URL \$WEBSITE_NAMESPACE \$SMTP_FROM \$SMTP_HOST \$SMTP_PORT \$SMTP_USER \$POCKET_ID_SMTP_TLS \$POCKET_ID_FRONTEND_URL \$POCKET_ID_URL \$POCKET_ID_DOMAIN" | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' | kubectl apply --server-side --force-conflicts -f -
```

(Einzige inhaltliche Änderung an der bestehenden `envsubst`-Zeile: `\$POCKET_ID_SMTP_TLS` wurde
zwischen `\$SMTP_USER` und `\$POCKET_ID_FRONTEND_URL` eingefügt.)

- [ ] **Step 4: `$SMTP_USER` + Herleitung im prod-Zweig von `workspace:deploy` ergänzen**

In `Taskfile.yml`, Task `workspace:deploy`, im prod-Zweig: die bestehende Zeile

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN"
```

ersetzen durch:

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

Und direkt vor der bestehenden Zeile `export POCKET_ID_FRONTEND_URL="${POCKET_ID_FRONTEND_URL:-https://id.${PROD_DOMAIN}}"`
das Herleitungs-Snippet aus Step 2 einfügen:

```bash
          # POCKET_ID_SMTP_TLS: von SMTP_SECURE + SMTP_PORT hergeleitet (Pocket-ID kennt kein
          # SMTP_SECURE-Bool, sondern SMTP_TLS=none|starttls|tls). secure=true -> implizites TLS
          # (z.B. Port 465); Port 587 ist bei allen aktuell konfigurierten Envs (mentolder,
          # korczewski, staging) STARTTLS gegen mailbox.org; alles andere (z.B. Mailpit dev auf
          # Port 1025) bleibt unverschluesselt.
          if [ "${SMTP_SECURE:-false}" = "true" ]; then
            export POCKET_ID_SMTP_TLS="tls"
          elif [ "${SMTP_PORT:-}" = "587" ]; then
            export POCKET_ID_SMTP_TLS="starttls"
          else
            export POCKET_ID_SMTP_TLS="none"
          fi
          export POCKET_ID_FRONTEND_URL="${POCKET_ID_FRONTEND_URL:-https://id.${PROD_DOMAIN}}"
```

- [ ] **Step 5: `$SMTP_USER` + Herleitung in `workspace:partial-deploy` spiegeln**

In `Taskfile.yml`, Task `workspace:partial-deploy` (muss laut bestehendem Kommentar "Mirror
workspace:deploy's prod envsubst contract EXACTLY" den prod-Zweig von `workspace:deploy`
identisch abbilden): dieselbe Zeilenänderung wie in Step 4 vornehmen — die bestehende Zeile

```bash
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN"
```

ersetzen durch:

```bash
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$SMTP_USER \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN \$POCKET_ID_SMTP_TLS"
```

Und vor dem `export MAIL_FROM_LOCAL="${SMTP_FROM%@*}"`-Block das Herleitungs-Snippet aus Step 2
einfügen:

```bash
        # POCKET_ID_SMTP_TLS: von SMTP_SECURE + SMTP_PORT hergeleitet (Pocket-ID kennt kein
        # SMTP_SECURE-Bool, sondern SMTP_TLS=none|starttls|tls). secure=true -> implizites TLS
        # (z.B. Port 465); Port 587 ist bei allen aktuell konfigurierten Envs (mentolder,
        # korczewski, staging) STARTTLS gegen mailbox.org; alles andere (z.B. Mailpit dev auf
        # Port 1025) bleibt unverschluesselt.
        if [ "${SMTP_SECURE:-false}" = "true" ]; then
          export POCKET_ID_SMTP_TLS="tls"
        elif [ "${SMTP_PORT:-}" = "587" ]; then
          export POCKET_ID_SMTP_TLS="starttls"
        else
          export POCKET_ID_SMTP_TLS="none"
        fi
        export MAIL_FROM_LOCAL="${SMTP_FROM%@*}"
```

- [ ] **Step 6: Test erneut ausführen und grünen Zustand bestätigen (GREEN)**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
# expected: PASS — alle 6 Tests "ok"
```

- [ ] **Step 7: Kustomize-Rendering lokal gegen Dev-Defaults verifizieren (kein Cluster nötig)**

```bash
POCKET_ID_FRONTEND_URL="http://id.localhost" POCKET_ID_URL="http://pocket-id:1411" \
POCKET_ID_DOMAIN="id.localhost" SMTP_HOST="mailpit.workspace.svc.cluster.local" \
SMTP_PORT="1025" SMTP_USER="noreply@localhost" SMTP_SECURE="false" \
POCKET_ID_SMTP_TLS="none" \
  kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | envsubst '$POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN $SMTP_HOST $SMTP_PORT $SMTP_USER $POCKET_ID_SMTP_TLS' \
  | grep -A1 'name: SMTP_TLS'
# expected: zeigt "value: none" (kein unsubstituierter ${...}-Platzhalter mehr)
```

- [ ] **Step 8: Commit**

```bash
git add k3d/pocket-id.yaml Taskfile.yml
git commit -m "fix(infra): wire SMTP_USER and SMTP_TLS through to pocket-id in all deploy paths [T001396]"
```

---

### Task 3: Kommentar-Dokumentation aktualisieren + Verifikation

**Files:**
- Modify: `Taskfile.yml:2599-2607` (bestehender Pocket-ID-Kommentarblock im prod-Zweig von
  `workspace:deploy`, referenziert T001068 Welle 0)

**Interfaces:**
- Consumes: nichts Neues
- Produces: nichts Neues (reine Doku-Ergänzung, kein Verhaltensunterschied)

- [ ] **Step 1: Kommentarblock um SMTP_TLS-Kontext ergänzen**

Den bestehenden Kommentarblock (beginnt mit `# Pocket ID (T001068 Welle 0): POCKET_ID_DOMAIN
lives in`) um folgende Zeile ergänzen, direkt vor der Zeile
`ENVSUBST_VARS="$ENVSUBST_VARS \$POCKET_ID_FRONTEND_URL \$POCKET_ID_URL \$POCKET_ID_DOMAIN"`:

```bash
          # POCKET_ID_SMTP_TLS (T001396): abgeleitet aus SMTP_SECURE + SMTP_PORT, siehe
          # Herleitungs-Snippet oben — kein eigenes Schema-Pflichtfeld, da Pocket-ID (anders als
          # Website/Nextcloud) ein Drei-Werte-Enum statt eines Bools erwartet.
```

- [ ] **Step 2: Finale Verifikation**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "docs(infra): document POCKET_ID_SMTP_TLS derivation in workspace:deploy [T001396]"
```
