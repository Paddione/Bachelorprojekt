---
title: Partial-Deploy — nur geänderte Services deployen — Implementation Plan
ticket_id: T000591
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Partial-Deploy — nur geänderte Services deployen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Factory-Deploy-Schritt rollt nur die Services aus, deren `k3d/*.yaml` ein PR tatsächlich geändert hat (statt aller ~57), via `kubectl apply -l "app in (...)"` auf dem vollständigen kustomize-Build-Output.

**Architecture:** Jede `k3d/*.yaml`-Ressource trägt ein einheitliches `app: <slug>`-Label. Eine neue `scripts/factory/service-registry.sh` mappt jede Datei auf ihren Slug und listet die nie-partial-deploybaren Infra-Dateien. Ein neuer Taskfile-Task `workspace:partial-deploy` baut die Overlay wie `workspace:deploy`, filtert den Apply aber per Label-Selector. `scripts/factory/pipeline.js` entscheidet in der Deploy-Phase anhand der `touched_files`, ob partial (≤5 Services, keine Infra-Änderung) oder full deployed wird, und injiziert das passende Kommando in den Deploy-Agent-Prompt.

**Tech Stack:** Bash (associative arrays), go-task (Taskfile.yml), Node.js (pipeline.js, `child_process`), kustomize + envsubst + kubectl server-side apply, BATS (tests/local/FA-SF-*).

---

## Ground Truth (vom Spec abweichend — VERBINDLICH)

Diese Fakten wurden am Branch verifiziert und überschreiben ungenaue Spec-Angaben:

- **Es gibt 57 `k3d/*.yaml`-Dateien, nicht 47.** Die Spec-Tabelle ist nur illustrativ. Die vollständige Liste steht in Task 2 unten.
- **Factory-BATS liegen in `tests/local/FA-SF-*.bats`, NICHT in `tests/unit/factory/`.** Der Task `test:factory` (Taskfile.yml:464-468) globbt `tests/local/FA-SF-*.bats tests/local/FA-AR-*.bats`. Die neue Testdatei MUSS daher `tests/local/FA-SF-60-partial-deploy.bats` heißen, damit sie automatisch in `task test:all` läuft. Lege NICHTS unter `tests/unit/factory/` an.
- **`brett.yaml` hat bereits `app: brett`-Labels.** Viele andere Dateien haben bereits teilweise `app:`-Labels. Task 2 ist additiv/idempotent — nur fehlende Labels ergänzen, vorhandene NICHT duplizieren.
- **Die Deploy-Phase in `pipeline.js` ruft NICHT `runTask(...)` auf** (das war Pseudocode in der Spec). Sie injiziert Kommandos als Text in den Deploy-Agent-Prompt (Schritt 6, pipeline.js:574-577). Die Integration berechnet in JS das Deploy-Kommando und injiziert es.
- **`featureTouchedFiles`** ist die in `pipeline.js` bereits gehoistete Liste der berührten Dateien (gesetzt in der Scout-Phase, pipeline.js:193). Sie ist in der Deploy-Phase verfügbar.

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `scripts/factory/service-registry.sh` | SSOT-Mapping `k3d/<file>.yaml → slug` + `INFRA_FILES` + Resolver-Funktion `resolve_partial_services` | **Neu** |
| `k3d/*.yaml` (Service-Dateien) | Tragen `app: <slug>` auf jeder top-level Ressource | **Modify** (additiv) |
| `Taskfile.yml` | Task `workspace:partial-deploy` (selektiver Apply) | **Modify** (neuer Task nach `workspace:deploy`, ~Zeile 2112) |
| `scripts/factory/pipeline.js` | Deploy-Phase: partial-vs-full-Entscheidung + Kommando-Injektion | **Modify** (vor Deploy-Agent, ~Zeile 480) |
| `tests/local/FA-SF-60-partial-deploy.bats` | Unit-Tests: Registry-Vollständigkeit, Infra-Klassifikation, Schwellwert, Task-Existenz | **Neu** |

---

## Phase A: service-registry.sh anlegen + Unit-Test-Skeleton

Ziel: Die Registry ist die Single Source of Truth. Wir bauen sie TDD-first: zuerst der Test, der die Vollständigkeit gegen das reale `k3d/`-Verzeichnis prüft, dann das Skript.

### Task A1: Failing-Test-Skeleton für die Registry

**Files:**
- Create: `tests/local/FA-SF-60-partial-deploy.bats`

- [ ] **Step 1: Schreibe die Testdatei mit dem Vollständigkeits-Test**

Datei `tests/local/FA-SF-60-partial-deploy.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-60: structural contract for partial-deploy (offline, no cluster).
#   - service-registry.sh maps EVERY k3d/*.yaml to a slug or INFRA
#   - infra files are never partial-deployable
#   - resolve_partial_services applies the ≤5 / no-infra threshold
#   - Taskfile exposes workspace:partial-deploy
REG="scripts/factory/service-registry.sh"
setup() { load 'test_helper.bash'; }

@test "FA-SF-60: service-registry.sh exists and passes bash -n" {
  [ -f "$REG" ]
  run bash -n "$REG"
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: every k3d/*.yaml is classified (registry slug OR infra)" {
  # shellcheck disable=SC1090
  source "$REG"
  local missing=()
  for f in k3d/*.yaml; do
    # kustomization.yaml is the kustomize entrypoint, not a deployable resource
    [ "$f" = "k3d/kustomization.yaml" ] && continue
    if [ -n "${SERVICE_REGISTRY[$f]:-}" ]; then continue; fi
    local is_infra=0
    for inf in "${INFRA_FILES[@]}"; do [ "$inf" = "$f" ] && is_infra=1 && break; done
    [ "$is_infra" -eq 1 ] || missing+=("$f")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'UNCLASSIFIED: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}
```

- [ ] **Step 2: Lauf zur Bestätigung, dass er fehlschlägt**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats`
Expected: FAIL — `scripts/factory/service-registry.sh` existiert noch nicht (`[ -f "$REG" ]` rot).

- [ ] **Step 3: Commit (red test)**

```bash
git add tests/local/FA-SF-60-partial-deploy.bats
git commit -m "test(factory): failing contract for partial-deploy service registry [T000588]"
```

### Task A2: service-registry.sh implementieren

**Files:**
- Create: `scripts/factory/service-registry.sh`
- Test: `tests/local/FA-SF-60-partial-deploy.bats` (aus A1)

- [ ] **Step 1: Lege `scripts/factory/service-registry.sh` an**

Vollständiger Inhalt (deckt ALLE 56 deploybaren + Infra-Dateien ab; `k3d/kustomization.yaml` ist bewusst ausgenommen):

```bash
#!/usr/bin/env bash
# scripts/factory/service-registry.sh
# SSOT: maps each k3d/<file>.yaml to an `app:` slug for partial-deploy label-selection.
# Sourced by the workspace:partial-deploy task and by scripts/factory/pipeline.js.
# CONTRACT (enforced by tests/local/FA-SF-60): every k3d/*.yaml (except kustomization.yaml)
# is EITHER a SERVICE_REGISTRY key OR an INFRA_FILES entry. Add new k3d files here.

# k3d/<file>.yaml -> app slug. Multiple files may share a slug.
declare -A SERVICE_REGISTRY=(
  [k3d/brett.yaml]="brett"
  [k3d/oauth2-proxy-brett.yaml]="brett"
  [k3d/keycloak.yaml]="keycloak"
  [k3d/nextcloud.yaml]="nextcloud"
  [k3d/nextcloud-redis.yaml]="nextcloud"
  [k3d/shared-db.yaml]="shared-db"
  [k3d/livekit.yaml]="livekit"
  [k3d/vaultwarden.yaml]="vaultwarden"
  [k3d/vaultwarden-seed-job.yaml]="vaultwarden"
  [k3d/vaultwarden-seed-credentials.yaml]="vaultwarden"
  [k3d/mailpit.yaml]="mailpit"
  [k3d/mail-ingressroute-dev.yaml]="mailpit"
  [k3d/oauth2-proxy-mailpit.yaml]="mailpit"
  [k3d/docs.yaml]="docs"
  [k3d/oauth2-proxy-docs.yaml]="docs"
  [k3d/whiteboard.yaml]="whiteboard"
  [k3d/talk-hpb.yaml]="talk"
  [k3d/talk-recording.yaml]="talk"
  [k3d/backup-cronjob.yaml]="backup"
  [k3d/backup-config.yaml]="backup"
  [k3d/backup-pvc.yaml]="backup"
  [k3d/backup-secrets.yaml]="backup"
  [k3d/pvc-backup-cronjob.yaml]="backup"
  [k3d/pvc-backup-rbac.yaml]="backup"
  [k3d/knowledge-ingest-cronjob.yaml]="knowledge"
  [k3d/notify-unread-cronjob.yaml]="cronjobs"
  [k3d/admin-actions-cronjobs.yaml]="cronjobs"
  [k3d/cronjob-monthly-billing.yaml]="cronjobs"
  [k3d/cronjob-dunning-detection.yaml]="cronjobs"
  [k3d/cronjob-systemtest-cleanup.yaml]="cronjobs"
  [k3d/tests-retention-cronjob.yaml]="cronjobs"
  [k3d/einvoice-sidecar.yaml]="einvoice"
  [k3d/oauth2-proxy-comfy.yaml]="oauth2-proxy"
  [k3d/oauth2-proxy-traefik.yaml]="traefik"
  [k3d/traefik-dashboard-dev.yaml]="traefik"
  [k3d/ingress.yaml]="traefik"
  [k3d/claude-code-config.yaml]="claude-code"
  [k3d/claude-code-mcp-auth.yaml]="claude-code"
  [k3d/claude-code-mcp-browser.yaml]="claude-code"
  [k3d/claude-code-mcp-github.yaml]="claude-code"
  [k3d/claude-code-mcp-ops.yaml]="claude-code"
  [k3d/claude-code-rbac.yaml]="claude-code"
  [k3d/pentest-flags.yaml]="pentest"
  [k3d/recovery-browser.yaml]="recovery"
  [k3d/recovery-pvc.yaml]="recovery"
  [k3d/website.yaml]="website"
  [k3d/website-rbac.yaml]="website"
  [k3d/website-schema.yaml]="website"
  [k3d/website-seller-config.yaml]="website"
  [k3d/website-dev-secrets.yaml]="website"
  [k3d/cicd-deploy-sa.yaml]="cicd"
)

# Infra: namespace/network/secrets/controller — ALWAYS full-deploy, never partial.
INFRA_FILES=(
  "k3d/namespace.yaml"
  "k3d/network-policies.yaml"
  "k3d/configmap-domains.yaml"
  "k3d/secrets.yaml"
  "k3d/sealed-secrets-controller.yaml"
)

# resolve_partial_services <csv-of-touched-files>
# Echos a comma-separated, de-duped slug list IFF a partial deploy is safe:
#   - all touched k3d/*.yaml files map to a slug (no infra, no unknown k3d file)
#   - there is at least one touched k3d service file
#   - the distinct slug count is <= PARTIAL_DEPLOY_MAX (default 5)
# Otherwise echos nothing (caller falls back to full workspace:deploy) and returns 1.
resolve_partial_services() {
  local csv="${1:-}"
  local max="${PARTIAL_DEPLOY_MAX:-5}"
  local -a files slugs=()
  IFS=',' read -r -a files <<< "$csv"
  local f saw_k3d=0
  for f in "${files[@]}"; do
    [ -z "$f" ] && continue
    case "$f" in
      k3d/*.yaml) saw_k3d=1 ;;
      *) continue ;;  # non-k3d changes are deployed by the full path anyway
    esac
    # infra touched -> abort partial
    local inf
    for inf in "${INFRA_FILES[@]}"; do [ "$inf" = "$f" ] && return 1; done
    # kustomization.yaml change -> structural, force full deploy
    [ "$f" = "k3d/kustomization.yaml" ] && return 1
    local slug="${SERVICE_REGISTRY[$f]:-}"
    [ -z "$slug" ] && return 1  # unknown k3d file -> fail safe to full deploy
    slugs+=("$slug")
  done
  [ "$saw_k3d" -eq 1 ] || return 1
  # de-dupe
  local uniq; uniq=$(printf '%s\n' "${slugs[@]}" | sort -u)
  local count; count=$(printf '%s\n' "$uniq" | grep -c .)
  [ "$count" -le "$max" ] || return 1
  printf '%s' "$(printf '%s\n' "$uniq" | paste -sd, -)"
}
```

- [ ] **Step 2: Lauf des Vollständigkeits-Tests**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats`
Expected: Beide Tests PASS. Falls `FA-SF-60: every k3d/*.yaml is classified` fehlschlägt, druckt der Test `UNCLASSIFIED: k3d/<datei>.yaml` auf stderr — füge die Datei der Registry oder `INFRA_FILES` hinzu und wiederhole.

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/service-registry.sh
git commit -m "feat(factory): service-registry maps k3d files to app slugs [T000588]"
```

### Task A3: Resolver-Verhaltenstests (Schwellwert + Infra)

**Files:**
- Modify: `tests/local/FA-SF-60-partial-deploy.bats`

- [ ] **Step 1: Hänge die Verhaltens-Tests an die Testdatei an**

```bash
@test "FA-SF-60: resolve_partial_services returns slugs for a small service-only diff" {
  source "$REG"
  run resolve_partial_services "k3d/brett.yaml,website/src/pages/index.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}

@test "FA-SF-60: dedups multiple files of the same service" {
  source "$REG"
  run resolve_partial_services "k3d/nextcloud.yaml,k3d/nextcloud-redis.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "nextcloud" ]
}

@test "FA-SF-60: infra change forces full deploy (non-zero, empty)" {
  source "$REG"
  run resolve_partial_services "k3d/namespace.yaml,k3d/brett.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: unknown k3d file forces full deploy (fail safe)" {
  source "$REG"
  run resolve_partial_services "k3d/brand-new-service.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: a diff touching no k3d service file returns non-zero" {
  source "$REG"
  run resolve_partial_services "website/src/pages/index.astro,Taskfile.yml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: more than PARTIAL_DEPLOY_MAX services forces full deploy" {
  source "$REG"
  run env PARTIAL_DEPLOY_MAX=2 resolve_partial_services "k3d/brett.yaml,k3d/keycloak.yaml,k3d/docs.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: kustomization.yaml change forces full deploy" {
  source "$REG"
  run resolve_partial_services "k3d/kustomization.yaml"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Lauf**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats`
Expected: alle Tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/local/FA-SF-60-partial-deploy.bats
git commit -m "test(factory): resolver threshold + infra-classification cases [T000588]"
```

---

## Phase B: app-Labels auf alle k3d/*.yaml-Service-Dateien

Ziel: Jede top-level Ressource (Deployment, Service, Ingress, CronJob, ConfigMap, PVC, Secret, RBAC, Job, IngressRoute) in jeder NICHT-Infra `k3d/*.yaml` trägt `metadata.labels.app: <slug>`, sodass `kubectl apply -l "app in (...)"` greift.

**Verifikations-Skript für jede Datei** (statt blindem Editieren): nutze dieses One-Off, um pro Datei zu sehen, welche Ressourcen noch KEIN `app:`-Label haben:

```bash
# Zeigt jede top-level metadata: und ob im Block bereits app: steht
awk '/^kind:/{kind=$2} /^metadata:/{print "  ["kind"]"} /^  labels:/{inlabels=1} /^    app:/{if(inlabels)print "    HAS app"} /^[a-z]/{if($0!~/^metadata/)inlabels=0}' k3d/<file>.yaml
```

> **Wichtig (idempotent):** Dateien wie `brett.yaml` haben bereits `app: <slug>` auf allen Ressourcen — NICHT anfassen/duplizieren. Nur fehlende Labels ergänzen. Das Label muss auf **`metadata.labels.app`** der TOP-LEVEL-Ressource sitzen (nicht auf `spec.template.metadata.labels` — das ist der Pod-Selector und schon vorhanden). `kubectl apply -l` selektiert anhand des Top-Level-`metadata.labels`.

Die Arbeit ist in Slug-Gruppen aufgeteilt; jede Gruppe ist ein eigener Commit, damit Reviews und ein eventuelles `git bisect` handhabbar bleiben. Pro Datei: für jede top-level Ressource ohne `app:`-Label den `app: <slug>`-Eintrag unter `metadata.labels` einfügen (falls `labels:` fehlt, `labels:`-Block anlegen).

### Task B1: Bereits gelabelte Dateien verifizieren (kein Edit)

**Files:**
- Read-only: `k3d/brett.yaml`, `k3d/keycloak.yaml`, `k3d/nextcloud.yaml`, `k3d/website.yaml`, `k3d/shared-db.yaml`

- [ ] **Step 1: Prüfe, welche Service-Dateien schon vollständig gelabelt sind**

Run (für jede Datei):
```bash
for f in k3d/brett.yaml k3d/keycloak.yaml k3d/nextcloud.yaml k3d/website.yaml k3d/shared-db.yaml; do
  echo "=== $f ==="
  awk '/^kind:/{k=$2} /^metadata:/{m=1;next} m&&/^  labels:/{l=1} m&&/^    app:/{print "  "k" -> "$0; m=0;l=0} m&&/^[a-z]/{print "  "k" -> NO app label"; m=0}' "$f"
done
```
Expected: Dateien, deren jede Ressource `-> app: <slug>` zeigt, sind fertig — überspringen. Notiere die mit `NO app label` für die nächsten Tasks.

- [ ] **Step 2: Kein Commit (reine Inspektion).**

### Task B2: Label-Gruppe „backup" (5 Dateien)

**Files:**
- Modify: `k3d/backup-cronjob.yaml`, `k3d/backup-config.yaml`, `k3d/backup-pvc.yaml`, `k3d/backup-secrets.yaml`, `k3d/pvc-backup-cronjob.yaml`, `k3d/pvc-backup-rbac.yaml`

- [ ] **Step 1: Füge `app: backup` zu jeder top-level Ressource hinzu, der es fehlt**

Für jede Ressource ohne `app:`-Label, unter `metadata:` ergänzen (Beispiel-Form):
```yaml
metadata:
  name: <unverändert>
  labels:
    app: backup
```
Existiert bereits ein `labels:`-Block, nur die Zeile `    app: backup` ergänzen. Existiert kein `labels:`-Block, den ganzen Block wie oben einfügen (Einrückung: `labels:` 2 Spaces, `app:` 4 Spaces).

- [ ] **Step 2: Verifiziere, dass jede Ressource nun ein `app:`-Label trägt**

Run:
```bash
for f in k3d/backup-cronjob.yaml k3d/backup-config.yaml k3d/backup-pvc.yaml k3d/backup-secrets.yaml k3d/pvc-backup-cronjob.yaml k3d/pvc-backup-rbac.yaml; do
  kinds=$(grep -c '^kind:' "$f"); apps=$(grep -c '^    app: backup' "$f")
  echo "$f kinds=$kinds app-labels=$apps"
done
```
Expected: für jede Datei `app-labels >= kinds` (≥, da manche Ressourcen schon ein anderes `app:` an tieferer Stelle haben können — entscheidend ist, dass jede top-level Ressource abgedeckt ist; bei Zweifel die awk-Inspektion aus B1 erneut laufen).

- [ ] **Step 3: Validiere, dass kustomize weiterhin baut**

Run: `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
Expected: `OK` (kein YAML-Fehler durch die Edits).

- [ ] **Step 4: Commit**

```bash
git add k3d/backup-cronjob.yaml k3d/backup-config.yaml k3d/backup-pvc.yaml k3d/backup-secrets.yaml k3d/pvc-backup-cronjob.yaml k3d/pvc-backup-rbac.yaml
git commit -m "chore(k3d): app=backup labels for partial-deploy [T000588]"
```

### Task B3: Label-Gruppe „claude-code" (6 Dateien)

**Files:**
- Modify: `k3d/claude-code-config.yaml`, `k3d/claude-code-mcp-auth.yaml`, `k3d/claude-code-mcp-browser.yaml`, `k3d/claude-code-mcp-github.yaml`, `k3d/claude-code-mcp-ops.yaml`, `k3d/claude-code-rbac.yaml`

- [ ] **Step 1:** Füge `app: claude-code` zu jeder top-level Ressource ohne `app:`-Label hinzu (Form wie B2, Slug `claude-code`).
- [ ] **Step 2:** Verifiziere wie B2-Step-2 (Slug `claude-code`).
- [ ] **Step 3:** `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
- [ ] **Step 4: Commit**

```bash
git add k3d/claude-code-config.yaml k3d/claude-code-mcp-auth.yaml k3d/claude-code-mcp-browser.yaml k3d/claude-code-mcp-github.yaml k3d/claude-code-mcp-ops.yaml k3d/claude-code-rbac.yaml
git commit -m "chore(k3d): app=claude-code labels for partial-deploy [T000588]"
```

### Task B4: Label-Gruppe „cronjobs" (6 Dateien)

**Files:**
- Modify: `k3d/notify-unread-cronjob.yaml`, `k3d/admin-actions-cronjobs.yaml`, `k3d/cronjob-monthly-billing.yaml`, `k3d/cronjob-dunning-detection.yaml`, `k3d/cronjob-systemtest-cleanup.yaml`, `k3d/tests-retention-cronjob.yaml`

- [ ] **Step 1:** Füge `app: cronjobs` zu jeder top-level Ressource ohne `app:`-Label hinzu.
- [ ] **Step 2:** Verifiziere (Slug `cronjobs`).
- [ ] **Step 3:** `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
- [ ] **Step 4: Commit**

```bash
git add k3d/notify-unread-cronjob.yaml k3d/admin-actions-cronjobs.yaml k3d/cronjob-monthly-billing.yaml k3d/cronjob-dunning-detection.yaml k3d/cronjob-systemtest-cleanup.yaml k3d/tests-retention-cronjob.yaml
git commit -m "chore(k3d): app=cronjobs labels for partial-deploy [T000588]"
```

### Task B5: Label-Gruppe „traefik" + „mailpit" + „docs" (8 Dateien)

**Files:**
- Modify: `k3d/ingress.yaml`, `k3d/traefik-dashboard-dev.yaml`, `k3d/oauth2-proxy-traefik.yaml` (slug `traefik`); `k3d/mailpit.yaml`, `k3d/mail-ingressroute-dev.yaml`, `k3d/oauth2-proxy-mailpit.yaml` (slug `mailpit`); `k3d/docs.yaml`, `k3d/oauth2-proxy-docs.yaml` (slug `docs`)

- [ ] **Step 1:** Pro Datei den jeweils zugehörigen Slug (`traefik` / `mailpit` / `docs`) auf jede top-level Ressource ohne `app:`-Label setzen.
- [ ] **Step 2:** Verifiziere pro Slug-Gruppe (awk-Inspektion aus B1).
- [ ] **Step 3:** `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
- [ ] **Step 4: Commit**

```bash
git add k3d/ingress.yaml k3d/traefik-dashboard-dev.yaml k3d/oauth2-proxy-traefik.yaml k3d/mailpit.yaml k3d/mail-ingressroute-dev.yaml k3d/oauth2-proxy-mailpit.yaml k3d/docs.yaml k3d/oauth2-proxy-docs.yaml
git commit -m "chore(k3d): app labels traefik/mailpit/docs for partial-deploy [T000588]"
```

### Task B6: Label-Gruppe „website" + „vaultwarden" + „recovery" + „cicd" (12 Dateien)

**Files:**
- Modify (website): `k3d/website.yaml`, `k3d/website-rbac.yaml`, `k3d/website-schema.yaml`, `k3d/website-seller-config.yaml`, `k3d/website-dev-secrets.yaml`
- Modify (vaultwarden): `k3d/vaultwarden.yaml`, `k3d/vaultwarden-seed-job.yaml`, `k3d/vaultwarden-seed-credentials.yaml`
- Modify (recovery): `k3d/recovery-browser.yaml`, `k3d/recovery-pvc.yaml`
- Modify (cicd): `k3d/cicd-deploy-sa.yaml`
- Modify (oauth2-proxy slug): `k3d/oauth2-proxy-comfy.yaml`

- [ ] **Step 1:** Pro Datei zugehörigen Slug (`website`/`vaultwarden`/`recovery`/`cicd`/`oauth2-proxy`) auf jede top-level Ressource ohne `app:`-Label setzen.
- [ ] **Step 2:** Verifiziere pro Slug-Gruppe.
- [ ] **Step 3:** `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
- [ ] **Step 4: Commit**

```bash
git add k3d/website.yaml k3d/website-rbac.yaml k3d/website-schema.yaml k3d/website-seller-config.yaml k3d/website-dev-secrets.yaml k3d/vaultwarden.yaml k3d/vaultwarden-seed-job.yaml k3d/vaultwarden-seed-credentials.yaml k3d/recovery-browser.yaml k3d/recovery-pvc.yaml k3d/cicd-deploy-sa.yaml k3d/oauth2-proxy-comfy.yaml
git commit -m "chore(k3d): app labels website/vaultwarden/recovery/cicd for partial-deploy [T000588]"
```

### Task B7: Restliche Single-File-Services (talk, knowledge, einvoice, whiteboard, livekit, pentest, brett-oauth)

**Files:**
- Modify: `k3d/talk-hpb.yaml`, `k3d/talk-recording.yaml` (slug `talk`); `k3d/knowledge-ingest-cronjob.yaml` (slug `knowledge`); `k3d/einvoice-sidecar.yaml` (slug `einvoice`); `k3d/whiteboard.yaml` (slug `whiteboard`); `k3d/livekit.yaml` (slug `livekit`); `k3d/pentest-flags.yaml` (slug `pentest`); `k3d/oauth2-proxy-brett.yaml` (slug `brett`); `k3d/nextcloud-redis.yaml` (slug `nextcloud`)

- [ ] **Step 1:** Pro Datei zugehörigen Slug auf jede top-level Ressource ohne `app:`-Label setzen.
- [ ] **Step 2:** Verifiziere pro Datei.
- [ ] **Step 3:** `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo OK`
- [ ] **Step 4: Commit**

```bash
git add k3d/talk-hpb.yaml k3d/talk-recording.yaml k3d/knowledge-ingest-cronjob.yaml k3d/einvoice-sidecar.yaml k3d/whiteboard.yaml k3d/livekit.yaml k3d/pentest-flags.yaml k3d/oauth2-proxy-brett.yaml k3d/nextcloud-redis.yaml
git commit -m "chore(k3d): app labels remaining single-file services for partial-deploy [T000588]"
```

### Task B8: Label-Abdeckungs-Test gegen die laufende Build-Ausgabe

**Files:**
- Modify: `tests/local/FA-SF-60-partial-deploy.bats`

- [ ] **Step 1: Hänge einen Test an, der die gebaute Ausgabe gegen die Registry-Slugs prüft**

Dieser Test ist offline-fähig (kustomize ist lokal verfügbar; falls nicht, skippt er):

```bash
@test "FA-SF-60: every registry slug appears as an app: label in the kustomize build" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  source "$REG"
  local built; built=$(kustomize build k3d/ --load-restrictor=LoadRestrictionsNone 2>/dev/null) || skip "kustomize build failed offline"
  local missing=()
  local seen=()
  # unique slug set
  local slug
  for f in "${!SERVICE_REGISTRY[@]}"; do
    slug="${SERVICE_REGISTRY[$f]}"
    printf '%s\n' "${seen[@]}" | grep -qx "$slug" && continue
    seen+=("$slug")
    grep -Eq "app: ${slug}( |$)" <<< "$built" || missing+=("$slug")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'SLUG WITH NO app: LABEL IN BUILD: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}
```

- [ ] **Step 2: Lauf**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats`
Expected: PASS. Falls `SLUG WITH NO app: LABEL IN BUILD: <slug>` erscheint, fehlt das Label auf einer Datei dieses Slugs — zurück zur jeweiligen B-Task und ergänzen.

- [ ] **Step 3: Commit**

```bash
git add tests/local/FA-SF-60-partial-deploy.bats
git commit -m "test(factory): assert every slug has an app: label in the build [T000588]"
```

---

## Phase C: workspace:partial-deploy Task in Taskfile.yml

Ziel: Ein Task, der die Overlay wie `workspace:deploy` (prod-Pfad) baut, aber den Apply per `-l "app in (...)"` auf die übergebenen Slugs filtert. Wir spiegeln den envsubst-/sed-Pfad von `workspace:deploy` exakt, damit gerenderte Manifeste identisch sind.

### Task C1: Test für Task-Existenz + Selektor-Semantik

**Files:**
- Modify: `tests/local/FA-SF-60-partial-deploy.bats`

- [ ] **Step 1: Hänge Tests an, die den Task und seinen Selektor-Aufbau prüfen (statisch, kein Cluster)**

```bash
@test "FA-SF-60: Taskfile defines workspace:partial-deploy" {
  run grep -Eq '^  workspace:partial-deploy:' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy uses a label selector apply (app in (...))" {
  # the rendered apply must filter by the PARTIAL_SERVICES label set
  run grep -Eq 'app in \(' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy aborts when PARTIAL_SERVICES is empty" {
  run grep -Eq 'PARTIAL_SERVICES.*(required|must be set|empty)' Taskfile.yml
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Lauf zur Bestätigung Fehlschlag**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats -f "partial-deploy"`
Expected: die drei neuen Tests FAIL (Task existiert noch nicht).

- [ ] **Step 3: Commit**

```bash
git add tests/local/FA-SF-60-partial-deploy.bats
git commit -m "test(factory): contract for workspace:partial-deploy task [T000588]"
```

### Task C2: workspace:partial-deploy implementieren

**Files:**
- Modify: `Taskfile.yml` (neuer Task direkt nach `workspace:deploy`, das endet bei ~Zeile 2111)

- [ ] **Step 1: Füge den Task unmittelbar nach dem `workspace:deploy`-Block ein**

> Begründung der Struktur: Wir bauen die **Overlay** (`ENV_OVERLAY`) wie der prod-Zweig von `workspace:deploy`, nutzen dieselbe `ENVSUBST_VARS`-Liste und denselben `sed -E 's/\$\$.../$.../'`-Schritt, und hängen nur `-l "app in (${PARTIAL_SERVICES})"` an das finale `kubectl apply`. `--selector` filtert die `-f -`-Eingabe; nicht-passende Ressourcen werden nicht angewendet. Partial-Deploy ist prod-only (Factory deployt nach mentolder/korczewski) — der dev-Zweig wird nicht benötigt.

```yaml
  workspace:partial-deploy:
    desc: "Nur geänderte Services deployen (ENV=mentolder PARTIAL_SERVICES=brett,docs)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        if [ -z "{{.PARTIAL_SERVICES}}" ]; then
          echo "PARTIAL_SERVICES must be set (comma-separated app slugs), e.g. PARTIAL_SERVICES=brett,docs — aborting" >&2
          exit 1
        fi
        source scripts/env-resolve.sh "{{.ENV}}"

        if [ "{{.ENV}}" != "dev" ]; then
          active_ctx=$(kubectl config current-context 2>/dev/null || echo "")
          if [ "$active_ctx" != "$ENV_CONTEXT" ]; then
            echo "Switching kubectl context: $active_ctx → $ENV_CONTEXT"
            kubectl config use-context "$ENV_CONTEXT"
          fi
        fi

        _ws_ns="${WORKSPACE_NAMESPACE:-workspace}"
        overlay="${ENV_OVERLAY:-prod}"

        # Mirror workspace:deploy's prod envsubst contract EXACTLY so rendered
        # manifests are byte-identical (only the label selector differs).
        export MAIL_FROM_LOCAL="${SMTP_FROM%@*}"
        export MAIL_FROM_DOMAIN="${SMTP_FROM#*@}"
        ENVSUBST_VARS="\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$INFRA_NAMESPACE \$TLS_SECRET_NAME"
        ENVSUBST_VARS="$ENVSUBST_VARS \$SMTP_FROM \$SMTP_HOST \$MAIL_FROM_LOCAL \$MAIL_FROM_DOMAIN"
        ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE \$BRAND_ID"
        ENVSUBST_VARS="$ENVSUBST_VARS \$KC_USER1_USERNAME \$KC_USER1_EMAIL \$KC_USER2_USERNAME \$KC_USER2_EMAIL"
        ENVSUBST_VARS="$ENVSUBST_VARS \$BRETT_DOMAIN"
        ENVSUBST_VARS="$ENVSUBST_VARS \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$RECOVER_DOMAIN"
        ENVSUBST_VARS="$ENVSUBST_VARS \$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE"
        ENVSUBST_VARS="$ENVSUBST_VARS \$SYSTEMTEST_LOOP_ENABLED"
        ENVSUBST_VARS="$ENVSUBST_VARS \$LLM_HOST_IP \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$LLM_EMBED_URL"
        ENVSUBST_VARS="$ENVSUBST_VARS \$COMFY_HOST_IP \$COMFY_PORT"
        ENVSUBST_VARS="$ENVSUBST_VARS \$RIGGER_HOST_IP \$RIGGER_PORT"
        ENVSUBST_VARS="$ENVSUBST_VARS \$ARENA_WS_URL \$ARENA_IMAGE"
        ENVSUBST_VARS="$ENVSUBST_VARS \$DEV_DOMAIN \$DEV_NODE \$DEV_WEBSITE_HOST \$DEV_BRETT_HOST"
        export ARENA_IMAGE="${ARENA_IMAGE:-ghcr.io/paddione/arena-server:latest}"
        export DEV_DOMAIN="${DEV_DOMAIN:-}"
        export DEV_NODE="${DEV_NODE:-}"
        export DEV_WEBSITE_HOST="${DEV_WEBSITE_HOST:-}"
        export DEV_BRETT_HOST="${DEV_BRETT_HOST:-}"
        export SYSTEMTEST_LOOP_ENABLED="${SYSTEMTEST_LOOP_ENABLED:-false}"
        export LLM_HOST_IP="${LLM_HOST_IP:-}"
        export LLM_ENABLED="${LLM_ENABLED:-false}"
        export LLM_RERANK_ENABLED="${LLM_RERANK_ENABLED:-false}"
        export LLM_ROUTER_URL="${LLM_ROUTER_URL:-http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234}"
        export LLM_EMBED_URL="${LLM_EMBED_URL:-http://llm-gateway-embed.workspace.svc.cluster.local:8081}"
        export COMFY_HOST_IP="${COMFY_HOST_IP:-}"
        export COMFY_PORT="${COMFY_PORT:-}"
        export RIGGER_HOST_IP="${RIGGER_HOST_IP:-${COMFY_HOST_IP:-}}"
        export RIGGER_PORT="${RIGGER_PORT:-8190}"

        echo "Partial-deploy ENV={{.ENV}} ns=${_ws_ns} services=[{{.PARTIAL_SERVICES}}]"
        kustomize build "$overlay/" --load-restrictor=LoadRestrictionsNone \
          | envsubst "$ENVSUBST_VARS" \
          | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
          | kubectl --context "$ENV_CONTEXT" apply --server-side --force-conflicts \
            -l "app in ({{.PARTIAL_SERVICES}})" -f -
        echo "Partial-deploy applied. Rollout status per service:"
        for svc in $(printf '%s' "{{.PARTIAL_SERVICES}}" | tr ',' ' '); do
          kubectl --context "$ENV_CONTEXT" -n "${_ws_ns}" rollout status \
            "deployment/$svc" --timeout=180s 2>/dev/null || \
            echo "  (no deployment/$svc — service may be CronJob/Job-only, skipping rollout wait)"
        done
```

- [ ] **Step 2: Validiere die Taskfile-Syntax + Dry-Run-Parse**

Run: `task --list 2>&1 | grep partial-deploy && echo TASK-OK`
Expected: Zeile `* workspace:partial-deploy:` + `TASK-OK` (Taskfile parst).

- [ ] **Step 3: Lauf der C1-Tests**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats -f "partial-deploy"`
Expected: alle Task-Tests PASS.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(taskfile): workspace:partial-deploy applies only selected app slugs [T000588]"
```

---

## Phase D: Factory-Pipeline pipeline.js — partial-deploy Logik

Ziel: In der Deploy-Phase wird VOR dem Deploy-Agent berechnet, ob ein partial- oder full-Deploy gefahren wird, und das passende Kommando wird in Schritt 6 des Agent-Prompts injiziert. Die Entscheidung nutzt `scripts/factory/service-registry.sh` als SSOT (kein Slug-Mapping in JS dupliziert).

### Task D1: JS-Helper, der den Bash-Resolver aufruft

**Files:**
- Modify: `scripts/factory/pipeline.js` (vor dem `const deploy = await agent(`-Block, ~Zeile 480)

- [ ] **Step 1: Füge unmittelbar vor `const deploy = await agent(` (pipeline.js:481) den Resolver-Block ein**

```javascript
// ── Partial-deploy decision (T000588) ───────────────────────────────────────
// Source the bash service-registry SSOT and ask it whether the touched k3d files
// qualify for a partial deploy (≤5 services, no infra/unknown k3d files). If they
// do, we deploy only those `app:` slugs; otherwise we fall back to full
// workspace:deploy. featureTouchedFiles was hoisted in the Scout phase (line ~193).
function resolvePartialServices(touched) {
  try {
    const { execFileSync } = require('child_process')
    const csv = (touched ?? []).join(',')
    const out = execFileSync('bash', ['-c',
      `source ${REPO}/scripts/factory/service-registry.sh && resolve_partial_services "$1"`,
      'bash', csv],
      { encoding: 'utf8' }).trim()
    return out.length > 0 ? out : null  // empty stdout = no partial (caller falls back)
  } catch {
    return null  // resolver returned non-zero (infra/unknown/over-threshold) → full deploy
  }
}
const partialServices = resolvePartialServices(featureTouchedFiles)
// Per-brand deploy command injected into the Deploy agent's step 6.
const deployStepCmd = partialServices
  ? `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=${partialServices} && task workspace:partial-deploy ENV=korczewski PARTIAL_SERVICES=${partialServices}`
  : `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski`
log(`Deploy mode: ${partialServices ? `PARTIAL [${partialServices}]` : 'FULL'} (touched=${(featureTouchedFiles ?? []).length})`)
phaseEvent('deploy', partialServices ? 'partial' : 'full', partialServices ? `services=${partialServices}` : 'full deploy')
```

> Note: `REPO`, `log`, `phaseEvent`, `featureTouchedFiles` sind bereits oben in pipeline.js definiert/gehoistet (REPO als Konstante; `featureTouchedFiles` an Zeile ~193). `require('child_process')` wird an anderen Stellen in dieser Datei ebenso inline genutzt (z. B. Zeile 114/125).

- [ ] **Step 2: Verifiziere, dass die Datei weiterhin lädt**

Run: `node --check scripts/factory/pipeline.js && echo NODE-CHECK-OK`
Expected: `NODE-CHECK-OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): compute partial-vs-full deploy from touched_files [T000588]"
```

### Task D2: Deploy-Kommando in den Agent-Prompt injizieren

**Files:**
- Modify: `scripts/factory/pipeline.js` (Deploy-Agent-Prompt, Schritt 6, derzeit Zeilen 574-577)

- [ ] **Step 1: Ersetze den statischen Schritt-6-Text durch das berechnete Kommando**

Suche im Deploy-Agent-Prompt den Block:

```
   6. Deploy BOTH brands explicitly (fleet cluster, push-based — no GitOps reconciler):
      Website changes: task feature:website (auto-rolls out via CI for both brands)
      K8s/manifest changes: task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski
      (Or use the umbrella if available: task feature:deploy)
```

Ersetze ihn durch (interpolierte Template-Literal-Variante):

```
   6. Deploy BOTH brands explicitly (fleet cluster, push-based — no GitOps reconciler).
      DEPLOY MODE (pre-computed from touched_files): ${partialServices ? `PARTIAL — only services [${partialServices}]` : 'FULL'}.
      Website changes still auto-roll-out via CI (task feature:website); for the K8s/manifest
      deploy run EXACTLY this command (do not substitute a different one):
        ${deployStepCmd}
```

> Wichtig: Der gesamte Deploy-Agent-Prompt ist bereits ein Template-Literal (Backticks) — `${deployStepCmd}` und `${partialServices ? ... : ...}` werden korrekt interpoliert. Keine zusätzliche Escaping-Behandlung nötig.

- [ ] **Step 2: Verifiziere Lade- und Interpolations-Korrektheit**

Run: `node --check scripts/factory/pipeline.js && echo NODE-CHECK-OK`
Expected: `NODE-CHECK-OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): inject pre-computed deploy command into Deploy agent [T000588]"
```

### Task D3: Smoke-Test für die JS-Resolver-Integration

**Files:**
- Modify: `tests/local/FA-SF-60-partial-deploy.bats`

- [ ] **Step 1: Hänge einen Test an, der den JS-→-Bash-Resolver-Pfad end-to-end (offline) prüft**

```bash
@test "FA-SF-60: pipeline.js references the service-registry resolver" {
  run grep -q 'resolve_partial_services' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -q 'service-registry.sh' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: pipeline.js passes node --check" {
  command -v node >/dev/null || skip "node not installed"
  run node --check scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: the registry resolver invoked the JS way yields a slug for a service-only diff" {
  run bash -c 'source scripts/factory/service-registry.sh && resolve_partial_services "k3d/brett.yaml"'
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}
```

- [ ] **Step 2: Lauf**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-60-partial-deploy.bats`
Expected: alle Tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/local/FA-SF-60-partial-deploy.bats
git commit -m "test(factory): pipeline.js↔registry integration smoke [T000588]"
```

---

## Phase E: Tests grün machen + manuelle Dev-Cluster-Verifikation

Ziel: Die volle Offline-Test-Suite ist grün (so wie CI sie fährt), und das Feature ist an einem echten Cluster einmal beobachtet.

### Task E1: Volle Offline-Suite reproduzieren (wie CI)

- [ ] **Step 1: Factory-Bats isoliert**

Run: `task test:factory`
Expected: `tests/local/FA-SF-60-partial-deploy.bats` läuft mit und ist grün; keine Regression in den übrigen FA-SF-*.

- [ ] **Step 2: Manifest-Struktur-Tests (Labels dürfen kustomize nicht brechen)**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats`
Expected: PASS (die neuen `app:`-Labels brechen keine bestehende Manifest-Assertion).

- [ ] **Step 3: Komplette Offline-Suite + Freshness (CLAUDE.md: vor Push lokal reproduzieren)**

Run: `task test:all && task freshness:check`
Expected: beide grün. Falls `freshness:check` rot ist, regeneriere die betroffenen Artefakte (`task freshness:regenerate`) und committe.

- [ ] **Step 4: Falls etwas rot ist** — nutze `superpowers:systematic-debugging`, fixe, committe, und wiederhole Step 3. Kein Weitergehen mit roter Suite.

### Task E2: Manuelle Verifikation am Dev-k3d-Cluster

> Voraussetzung: ein erreichbarer Dev-Cluster (Kontext `k3d-mentolder-dev`, siehe CLAUDE.md „dev k3d cluster access"). Falls kein Cluster verfügbar ist, dokumentiere das im PR und überspringe E2 mit Begründung — die Offline-Suite (E1) ist das Gate, E2 ist Best-Effort-Beobachtung.

- [ ] **Step 1: Baseline-Pod-Generationen festhalten**

Run:
```bash
kubectl --context k3d-mentolder-dev -n workspace get deploy brett docs keycloak \
  -o custom-columns=NAME:.metadata.name,GEN:.metadata.generation
```
Notiere die `GEN`-Werte.

- [ ] **Step 2: Partial-Deploy nur brett**

Run: `task workspace:partial-deploy ENV=dev PARTIAL_SERVICES=brett`
Expected: Output `Partial-deploy ENV=dev ... services=[brett]`, und `deployment/brett` wird angewendet/gerollt. (ENV=dev nutzt `ENV_OVERLAY=prod`-Fallback → falls dev keine Overlay hat, teste stattdessen mit `ENV=mentolder` gegen einen Test-Kontext, ODER prüfe das gerenderte Selektor-Apply via `--dry-run=server`.)

- [ ] **Step 3: Bestätige, dass NUR brett berührt wurde**

Run:
```bash
kubectl --context k3d-mentolder-dev -n workspace get deploy brett docs keycloak \
  -o custom-columns=NAME:.metadata.name,GEN:.metadata.generation
```
Expected: `brett` GEN ist (höchstens) inkrementiert, `docs`/`keycloak` GEN UNVERÄNDERT gegenüber Step 1. Das beweist, dass der Label-Selector unberührte Services nicht anwendet/restartet.

- [ ] **Step 4: Full-Fallback-Pfad belegen (Infra-Änderung)**

Run (Trockenlauf der Resolver-Entscheidung, kein echter Deploy nötig):
```bash
bash -c 'source scripts/factory/service-registry.sh && resolve_partial_services "k3d/namespace.yaml,k3d/brett.yaml"; echo "rc=$?"'
```
Expected: leere Ausgabe + `rc=1` → Pipeline würde `workspace:deploy` (full) fahren. (Spec-Akzeptanzkriterium „PR mit `k3d/namespace.yaml` → full".)

- [ ] **Step 5: Verifikations-Notiz in den PR**

Dokumentiere im PR-Body die beobachteten GEN-Werte aus Step 1+3 und die `rc=1`-Ausgabe aus Step 4 als Evidenz (gemäß `superpowers:verification-before-completion`).

### Task E3: Abschluss

- [ ] **Step 1:** `superpowers:requesting-code-review` auf dem gesamten Branch-Diff laufen lassen; Findings adressieren.
- [ ] **Step 2:** Sicherstellen, dass alle Commits `[T000588]` tragen und die Branch-History sauber ist.
- [ ] **Step 3:** Übergabe an `dev-flow-execute` / Factory-Deploy-Phase (PR mit Auto-Merge öffnen — `gh pr merge <n> --squash --auto`).

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- Scope 1 (app-Labels auf alle k3d-Service-Dateien) → Phase B (B2–B7), verifiziert durch B8 + Registry-Test A2.
- Scope 2 (service-registry.sh Mapping) → Phase A (A2), Vollständigkeit erzwungen durch A1-Test.
- Scope 3 (Factory-Pipeline partial-Logik) → Phase D (D1/D2), Schwellwert ≤5 + Infra-Fallback im Resolver (A2) und JS-Helper.
- Scope 4 (`workspace:partial-deploy` Task) → Phase C (C2), Selektor-Apply gespiegelt vom prod-`workspace:deploy`.
- Tests (Registry-Vollständigkeit, Infra-Klassifikation, Schwellwert) → A1/A3/B8/C1/D3.
- Manuelle Verifikation (nur brett restartet; namespace→full) → E2 Step 2–4.

**Abweichungen vom Spec (bewusst, dokumentiert oben in „Ground Truth"):** 57 statt 47 Dateien; Tests in `tests/local/FA-SF-60-*` statt `tests/unit/factory/`; `pipeline.js` injiziert Kommando statt `runTask`; Slug `recovery`/`cicd`/`oauth2-proxy` ergänzt (im Spec nicht namentlich, aber von der „alle Dateien"-Anforderung abgedeckt).

**Out-of-Scope eingehalten:** Kein Kustomize-Overlay-Refactoring; ConfigMapGeneratoren bleiben unverändert (werden beim full-Pfad mitappliziert, beim partial bewusst ausgelassen — idempotent); Infra immer full; kein Auto-Rollback; kein Dependency-Graph; Korczewski nutzt dasselbe Schema (beide Marken im Deploy-Kommando D1).

**Type-/Namens-Konsistenz:** `resolve_partial_services` (bash) ↔ `resolvePartialServices` (JS-Wrapper) ↔ `partialServices`/`deployStepCmd` durchgängig; `SERVICE_REGISTRY`/`INFRA_FILES` durchgängig; Testdatei-Name `tests/local/FA-SF-60-partial-deploy.bats` überall identisch; Slug-Set in A2 ↔ B-Tasks ↔ B8-Test konsistent.
