---
title: Flux Complete Removal — Implementation Plan
ticket_id: null
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# Flux Complete Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entferne Flux vollständig (Verzeichnis, inerte Marker, stale Kommentare, Routing-Token), verschiebe die live Website-Overlays nach `prod-fleet/website-{brand}/` und verdrahte sie als Single-Source in `website:deploy` — ohne das verifizierte Keycloak-Realm-Import-`$$`-Escaping zu verändern.

**Architecture:** Push-based (kein Reconciler). Der Push-Deploy-`sed`-Collapse (`Taskfile.yml:1724/1831`) ersetzt Flux' drone-envsubst und braucht das `$$` weiter → unverändert. Live Website-Overlays werden auf ihr echtes additives Delta geslimmt (mentolder: TLS-Ingress; korczewski: IngressRoute-TLS-Patch + security-headers Middleware), nach `prod-fleet/website-{brand}/` verschoben und von `website:deploy` (prod) als Voll-Overlay via `kustomize build | envsubst | sed | kubectl apply --server-side` appliziert — was den imperativen `website.yaml`-Apply ersetzt und den T000146-Gap schließt. `environments/<env>.yaml` bleibt Single-Source für Brand-Config/Image/Affinity (redundante Overlay-Patches entfallen).

**Tech Stack:** Kustomize, GNU envsubst + sed, BATS, kubectl (server-side apply), Node.js test runner, go-task.

**Spec:** `docs/superpowers/specs/2026-06-01-flux-complete-removal-design.md` (vollständig, self-contained).

**Worktree:** `/tmp/wt-flux-complete-removal` auf Branch `feature/flux-complete-removal`. Alle Pfade unten sind repo-relativ; arbeite im Worktree.

---

## Task 1: Keycloak-Escaping-Guard-Test umbauen (der „getestete Realm-Import")

**Files:**
- Modify/Rewrite: `tests/unit/keycloak-entrypoint-escaping.bats`
- Reference (unverändert): `prod/import-entrypoint.sh`, `k3d/realm-import-entrypoint.sh`

- [ ] **Step 1: Den kompletten neuen Test schreiben**

Ersetze den **gesamten** Inhalt von `tests/unit/keycloak-entrypoint-escaping.bats` durch:

```bash
#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-entrypoint-escaping.bats — Guard the prod realm-import
# entrypoint's PUSH-DEPLOY $$-escaping. [T000320]
# ═══════════════════════════════════════════════════════════════════
# prod/import-entrypoint.sh is rendered into the keycloak-import-script
# ConfigMap. The PUSH deploy pipeline (Taskfile.yml lines 1724 dev-path and
# 1831 prod-path) runs:
#     kustomize build … | envsubst "$VARS" | sed -E 's/\$\$([a-zA-Z0-9_]|{)/$\1/g' | kubectl apply
# The trailing sed collapses `$${` → `${`. The script's own shell expansions
# are therefore DOUBLED (`$$`) so that:
#   1. envsubst (explicit var list) does not eat the script's own ${VAR}
#      expansions (the script's lowercase vars are not in that list), and
#   2. after the sed collapse the embedded script contains correct single-$
#      shell expansions (e.g. `eval val="\${${var}:-}"`).
#
# Historically this sed-collapse mirrored Flux's drone-envsubst, which had the
# same $${VAR}→${VAR} escape semantics. Flux is gone; the push-path sed is now
# the ONLY mechanism, and it needs the identical $$ doubling. The dev/k3d
# entrypoint (k3d/realm-import-entrypoint.sh) is the proven single-$ form the
# prod $$ must collapse to.
#
# Regression context: PR #1168 de-doubled these to single-$ and broke the
# rendered realm import. This test pins the $$ contract so the revert cannot
# be undone by mistake.
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROD_ENTRYPOINT="${PROJECT_DIR}/prod/import-entrypoint.sh"
DEV_ENTRYPOINT="${PROJECT_DIR}/k3d/realm-import-entrypoint.sh"

@test "prod entrypoint: push-sed \$\$ collapse yields valid single-\$ shell expansion" {
  run sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'eval val="\${${var}:-}"'
}

@test "prod entrypoint keeps the \$\$ escaping the push-sed contract needs" {
  # Single-$ here means the breaking regression (PR #1168) has returned.
  grep -qF 'eval val="\$${$${var}:-}"' "$PROD_ENTRYPOINT"
}

@test "prod entrypoint is valid POSIX sh after the push-sed \$\$ collapse" {
  # Simulate the push pipeline's $$ -> $ collapse, then syntax-check the result.
  sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT" | sh -n
}

@test "prod entrypoint collapses to the proven dev single-\$ semantics (tested realm import)" {
  # Parity: after the push-sed collapse, prod's $$ doubling must reduce to
  # exactly the dev entrypoint's working single-$ substitution lines. This is
  # the offline 'tested realm import' — it proves the rendered ConfigMap script
  # the cluster runs is identical in substitution semantics to the dev script.
  collapsed="$(sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT")"
  # (a) indirect-expansion line matches dev
  echo "$collapsed" | grep -qF 'eval val="\${${var}:-}"'
  grep -qF 'eval val="\${${var}:-}"' "$DEV_ENTRYPOINT"
  # (b) in-place realm-JSON substitution line matches dev
  echo "$collapsed" | grep -qF 'sed -i "s|\${${var}}|${val}|g"'
  grep -qF 'sed -i "s|\${${var}}|${val}|g"' "$DEV_ENTRYPOINT"
}
```

- [ ] **Step 2: Test laufen lassen — muss GRÜN sein (Regressions-Guard gegen unveränderten, korrekten Stand)**

Run: `cd /tmp/wt-flux-complete-removal && ./tests/runner.sh local 2>/dev/null | grep -i keycloak-entrypoint || bats tests/unit/keycloak-entrypoint-escaping.bats`
Expected: alle 4 Tests PASS (das `$$` ist bereits korrekt; der Test nagelt es fest).

- [ ] **Step 3: RED-Beweis — Guard beißt bei De-Doubling**

Run:
```bash
cd /tmp/wt-flux-complete-removal
cp prod/import-entrypoint.sh /tmp/ep.bak
sed -i 's/\$\$/$/g' prod/import-entrypoint.sh        # simuliere PR-#1168-Regression
bats tests/unit/keycloak-entrypoint-escaping.bats ; echo "exit=$?"
cp /tmp/ep.bak prod/import-entrypoint.sh             # revert
git diff --quiet prod/import-entrypoint.sh && echo "REVERTED-CLEAN"
```
Expected: bei de-doubled Script schlägt mindestens der „keeps the \$\$ escaping"-Test FEHL (exit != 0); nach Revert `REVERTED-CLEAN`. `prod/import-entrypoint.sh` bleibt unverändert gegenüber HEAD.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add tests/unit/keycloak-entrypoint-escaping.bats
git commit -m "test(keycloak): reframe \$\$-escaping guard to push-sed + add render-parity test [T000320]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: mentolder Website-Overlay nach prod-fleet/ verschieben (slim)

**Files:**
- Create: `prod-fleet/website-mentolder/kustomization.yaml`
- Move: `flux/apps/website-mentolder/website-ingress-web.yaml` → `prod-fleet/website-mentolder/website-ingress-web.yaml`

- [ ] **Step 1: Ingress-Datei verschieben (Inhalt unverändert)**

```bash
cd /tmp/wt-flux-complete-removal
mkdir -p prod-fleet/website-mentolder
git mv flux/apps/website-mentolder/website-ingress-web.yaml prod-fleet/website-mentolder/website-ingress-web.yaml
```

- [ ] **Step 2: Slim kustomization.yaml anlegen**

Create `prod-fleet/website-mentolder/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: website
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  # mentolder HTTPS Ingress (tracked here to survive cluster rebuilds — T000146)
  - website-ingress-web.yaml
```
(Bewusst KEINE `patches:` — image-tag und website-config-patch sind redundant zu `environments/mentolder.yaml` + envsubst auf `k3d/website.yaml`.)

- [ ] **Step 3: Build verifizieren**

Run:
```bash
cd /tmp/wt-flux-complete-removal
kustomize build prod-fleet/website-mentolder/ --load-restrictor=LoadRestrictionsNone >/tmp/m.yaml && echo BUILD-OK
grep -c 'kind: Ingress' /tmp/m.yaml
grep -c 'name: website-ingress-web' /tmp/m.yaml
grep -c 'flux-system:' /tmp/m.yaml || echo "no flux markers (0)"
```
Expected: `BUILD-OK`; mind. 1× `kind: Ingress`; 1× `website-ingress-web`; `flux-system:` Count = 0.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add prod-fleet/website-mentolder/
git commit -m "refactor(website): relocate mentolder overlay flux/apps → prod-fleet (slim) [T000146]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: korczewski Website-Overlay nach prod-fleet/ verschieben (slim)

**Files:**
- Create: `prod-fleet/website-korczewski/kustomization.yaml`
- Move: `flux/apps/website-korczewski/website-security-headers.yaml` → `prod-fleet/website-korczewski/website-security-headers.yaml`

- [ ] **Step 1: Middleware-Datei verschieben (Inhalt unverändert)**

```bash
cd /tmp/wt-flux-complete-removal
mkdir -p prod-fleet/website-korczewski
git mv flux/apps/website-korczewski/website-security-headers.yaml prod-fleet/website-korczewski/website-security-headers.yaml
```

- [ ] **Step 2: Slim kustomization.yaml anlegen (nur der IngressRoute-TLS-Patch als echtes Delta)**

Create `prod-fleet/website-korczewski/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: website-korczewski
resources:
  - ../../k3d/website.yaml
  - ../../k3d/website-seller-config.yaml
  # Security-headers middleware in this namespace (allowCrossNamespace disabled on korczewski)
  - website-security-headers.yaml
patches:
  # Fix HTTPS: add websecure entryPoint + wildcard TLS cert (T000144)
  # Also adds security-headers middleware to the route so SA-01 headers are present (T000171)
  # Note: allowCrossNamespace is disabled on korczewski Traefik — middleware must be in
  # website-korczewski namespace to be usable from this IngressRoute.
  - target:
      kind: IngressRoute
      name: website
    patch: |-
      - op: replace
        path: /spec/entryPoints
        value:
          - web
          - websecure
      - op: add
        path: /spec/tls
        value:
          secretName: korczewski-tls
      - op: add
        path: /spec/routes/0/middlewares
        value:
          - name: website-security-headers
            namespace: website-korczewski
```
(Bewusst gedroppt ggü. dem alten flux-Overlay: image-tag-Patch, website-config-patch, **und** der node-affinity-replace-Patch — alle redundant zu `environments/korczewski.yaml` + imperativem `WEBSITE_NODE_AFFINITY`-Patch in `website:deploy`.)

- [ ] **Step 3: Build verifizieren**

Run:
```bash
cd /tmp/wt-flux-complete-removal
kustomize build prod-fleet/website-korczewski/ --load-restrictor=LoadRestrictionsNone >/tmp/k.yaml && echo BUILD-OK
grep -c 'kind: IngressRoute' /tmp/k.yaml
grep -c 'websecure' /tmp/k.yaml
grep -c 'korczewski-tls' /tmp/k.yaml
grep -c 'website-security-headers' /tmp/k.yaml
grep -c 'flux-system:' /tmp/k.yaml || echo "no flux markers (0)"
```
Expected: `BUILD-OK`; 1× IngressRoute; `websecure`, `korczewski-tls`, `website-security-headers` jeweils ≥1; `flux-system:` Count = 0.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add prod-fleet/website-korczewski/
git commit -m "refactor(website): relocate korczewski overlay flux/apps → prod-fleet (slim) [T000146]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: flux/ Verzeichnis löschen + inerte Marker entfernen

**Files:**
- Delete: `flux/` (verbleibende Dateien: 2× kustomization.yaml, 2× image-tag.yaml, 2× website-config-patch.yaml — alle redundant/relocatet)
- Modify: `k3d/brett.yaml:44`, `k3d/docs.yaml:21`, `k3d/shared-db.yaml:10-11`

- [ ] **Step 1: flux/ entfernen**

Run:
```bash
cd /tmp/wt-flux-complete-removal
git rm -r flux/
ls flux/ 2>/dev/null && echo "STILL EXISTS (FAIL)" || echo "flux/ gone"
```
Expected: `flux/ gone`.

- [ ] **Step 2: $imagepolicy-Kommentare strippen**

Edit `k3d/brett.yaml` Zeile 44 — von:
```
          image: ghcr.io/paddione/workspace-brett:latest # {"$imagepolicy": "flux-system:brett"}
```
zu:
```
          image: ghcr.io/paddione/workspace-brett:latest
```

Edit `k3d/docs.yaml` Zeile 21 — von:
```
          image: ghcr.io/paddione/workspace-docs:latest # {"$imagepolicy": "flux-system:docs"}
```
zu:
```
          image: ghcr.io/paddione/workspace-docs:latest
```

- [ ] **Step 3: Flux-reconcile-Annotation aus shared-db.yaml entfernen**

`k3d/shared-db.yaml` Zeilen 10-11 — entferne BEIDE Zeilen (der `annotations:`-Block enthält nur diesen einen Key, also den ganzen Block löschen):
```
  annotations:
    kustomize.toolkit.fluxcd.io/reconcile: disabled
```
Ergebnis: die `metadata:` des `shared-db-pvc` geht direkt von `namespace: workspace` zu `spec:` über.

- [ ] **Step 4: Verifizieren — keine Flux-Reste in den Manifests**

Run:
```bash
cd /tmp/wt-flux-complete-removal
grep -rIn 'fluxcd.io\|\$imagepolicy' k3d/ prod/ prod-fleet/ 2>/dev/null && echo "FLUX RESTE (FAIL)" || echo "clean"
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone >/dev/null && echo "k3d build OK"
```
Expected: `clean`; `k3d build OK` (shared-db.yaml bleibt valides YAML).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add -A k3d/ flux/
git commit -m "chore(flux): remove flux/ dir + inert imagepolicy/reconcile markers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: website:deploy auf Voll-Overlay-Single-Source verdrahten (prod)

**Files:**
- Modify: `Taskfile.yml` (`website:deploy`, ~2799-2843)

- [ ] **Step 1: Apply-Block dev/prod aufsplitten**

Im `website:deploy`-Task: der bisher UNCONDITIONAL ausgeführte Apply-Block (die `LLM_ENABLED=… envsubst "<big list>" < k3d/website.yaml | kubectl ${CTX_ARG} apply -f -` Zeile ~2804-2809 PLUS `envsubst "\$WEBSITE_NAMESPACE" < k3d/website-seller-config.yaml | kubectl ${CTX_ARG} apply -f -` Zeile ~2810) wird ersetzt durch:

```bash
        if [ "{{.ENV}}" = "dev" ]; then
          # Dev: imperative apply (web.localhost, no TLS, no prod overlay).
          LLM_ENABLED="${LLM_ENABLED:-false}" \
          LLM_RERANK_ENABLED="${LLM_RERANK_ENABLED:-false}" \
          LLM_ROUTER_URL="${LLM_ROUTER_URL:-http://llm-router.workspace.svc.cluster.local:4000}" \
          COMFY_HOST_IP="${COMFY_HOST_IP:-}" \
          COMFY_PORT="${COMFY_PORT:-}" \
          envsubst "\$WEBSITE_IMAGE \$BRAND_ID \$BRAND_NAME \$CONTACT_EMAIL \$CONTACT_NAME \$CONTACT_PHONE \$CONTACT_CITY \$LEGAL_STREET \$LEGAL_ZIP \$LEGAL_JOBTITLE \$LEGAL_UST_ID \$LEGAL_WEBSITE \$SMTP_FROM \$SMTP_USER \$SMTP_HOST \$SMTP_PORT \$SMTP_SECURE \$WEBSITE_HOST \$WEBSITE_SITE_URL \$KEYCLOAK_FRONTEND_URL \$NEXTCLOUD_EXTERNAL_URL \$DOCS_URL \$AUTH_EXTERNAL_URL \$VAULT_EXTERNAL_URL \$WHITEBOARD_EXTERNAL_URL \$TRAEFIK_EXTERNAL_URL \$MAIL_EXTERNAL_URL \$BRETT_DOMAIN \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$PROD_DOMAIN \$CLUSTER_ENV \$WEBSITE_NAMESPACE \$WORKSPACE_NAMESPACE \$SYSTEMTEST_LOOP_ENABLED \$ARENA_WS_URL \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$COMFY_HOST_IP \$COMFY_PORT" < k3d/website.yaml | kubectl ${CTX_ARG} apply -f -
          envsubst "\$WEBSITE_NAMESPACE" < k3d/website-seller-config.yaml | kubectl ${CTX_ARG} apply -f -
        else
          # Prod: apply the brand overlay as the single source of truth. The overlay
          # bundles k3d/website.yaml + website-seller-config.yaml + the additive TLS
          # resources (mentolder: website-ingress-web Ingress; korczewski: IngressRoute
          # TLS patch + website-security-headers Middleware). This REPLACES the former
          # imperative website.yaml apply and the never-applied flux/apps overlays
          # (closes the T000146 source-of-truth gap). Brand config/image/affinity stay
          # sourced from environments/<env>.yaml via the envsubst below + the node-affinity
          # patch (the overlay carries no redundant image-tag/config-patch).
          case "${BRAND_ID}" in
            mentolder)  WEBSITE_OVERLAY="prod-fleet/website-mentolder" ;;
            korczewski) WEBSITE_OVERLAY="prod-fleet/website-korczewski" ;;
            *) echo "ERROR: no website overlay for BRAND_ID=${BRAND_ID}"; exit 1 ;;
          esac
          LLM_ENABLED="${LLM_ENABLED:-false}" \
          LLM_RERANK_ENABLED="${LLM_RERANK_ENABLED:-false}" \
          LLM_ROUTER_URL="${LLM_ROUTER_URL:-http://llm-router.workspace.svc.cluster.local:4000}" \
          COMFY_HOST_IP="${COMFY_HOST_IP:-}" \
          COMFY_PORT="${COMFY_PORT:-}" \
          kustomize build "$WEBSITE_OVERLAY" --load-restrictor=LoadRestrictionsNone \
            | envsubst "\$WEBSITE_IMAGE \$BRAND_ID \$BRAND_NAME \$CONTACT_EMAIL \$CONTACT_NAME \$CONTACT_PHONE \$CONTACT_CITY \$LEGAL_STREET \$LEGAL_ZIP \$LEGAL_JOBTITLE \$LEGAL_UST_ID \$LEGAL_WEBSITE \$SMTP_FROM \$SMTP_USER \$SMTP_HOST \$SMTP_PORT \$SMTP_SECURE \$WEBSITE_HOST \$WEBSITE_SITE_URL \$KEYCLOAK_FRONTEND_URL \$NEXTCLOUD_EXTERNAL_URL \$DOCS_URL \$AUTH_EXTERNAL_URL \$VAULT_EXTERNAL_URL \$WHITEBOARD_EXTERNAL_URL \$TRAEFIK_EXTERNAL_URL \$MAIL_EXTERNAL_URL \$BRETT_DOMAIN \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$PROD_DOMAIN \$CLUSTER_ENV \$WEBSITE_NAMESPACE \$WORKSPACE_NAMESPACE \$SYSTEMTEST_LOOP_ENABLED \$ARENA_WS_URL \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$COMFY_HOST_IP \$COMFY_PORT" \
            | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
            | kubectl ${CTX_ARG} apply --server-side --force-conflicts -f -
        fi
```

Hinweise:
- Die `WEBSITE_HOST/WEBSITE_SITE_URL/KEYCLOAK_FRONTEND_URL`-Exports (oben im Task, ~2799-2802) bleiben unverändert und gelten für beide Zweige.
- Node-Affinity-Patch (~2812-2818), Dev-Secrets (~2820-2823) und Digest-Pin/rollout (~2825-2838) bleiben **unverändert** und laufen nach diesem Block — sie überschreiben Image/Affinity korrekt NACH dem Overlay-Apply.
- Der `sed`-Collapse ist hier harmlos (Website-Manifests enthalten kein `$$`) und hält die Pipeline konsistent mit `workspace:deploy`.

- [ ] **Step 2: Kommentar 2840-2842 umschreiben**

Ersetze den Kommentarblock (aktuell „TLS is handled by the website overlays under flux/apps/…") durch:
```bash
        # TLS/middlewares are applied from the prod-fleet/website-<brand>/ overlay
        # (now wired into this task above), not imperative patches:
        # - mentolder: website-ingress-web Ingress (workspace-wildcard-tls + middlewares)
        # - korczewski: IngressRoute TLS patch (korczewski-tls + websecure) + security-headers
        # Removed blanket certResolver:letsencrypt patch that broke korczewski (T000147).
```

- [ ] **Step 3: Render-Verifikation (keine unaufgelösten Platzhalter) — offline mit Dummy-Env**

Run:
```bash
cd /tmp/wt-flux-complete-removal
for b in mentolder korczewski; do
  source scripts/env-resolve.sh "$b" >/dev/null 2>&1 || true
  out=$(kustomize build prod-fleet/website-$b --load-restrictor=LoadRestrictionsNone \
    | envsubst "\$WEBSITE_IMAGE \$BRAND_ID \$BRAND_NAME \$CONTACT_EMAIL \$CONTACT_NAME \$CONTACT_PHONE \$CONTACT_CITY \$LEGAL_STREET \$LEGAL_ZIP \$LEGAL_JOBTITLE \$LEGAL_UST_ID \$LEGAL_WEBSITE \$SMTP_FROM \$SMTP_USER \$SMTP_HOST \$SMTP_PORT \$SMTP_SECURE \$WEBSITE_HOST \$WEBSITE_SITE_URL \$KEYCLOAK_FRONTEND_URL \$NEXTCLOUD_EXTERNAL_URL \$DOCS_URL \$AUTH_EXTERNAL_URL \$VAULT_EXTERNAL_URL \$WHITEBOARD_EXTERNAL_URL \$TRAEFIK_EXTERNAL_URL \$MAIL_EXTERNAL_URL \$BRETT_DOMAIN \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$PROD_DOMAIN \$CLUSTER_ENV \$WEBSITE_NAMESPACE \$WORKSPACE_NAMESPACE \$SYSTEMTEST_LOOP_ENABLED \$ARENA_WS_URL \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$COMFY_HOST_IP \$COMFY_PORT" \
    | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g')
  echo "$out" | grep -nE '\$\{[A-Z_]+\}' && echo "$b: UNRESOLVED (FAIL)" || echo "$b: no unresolved placeholders"
done
```
Expected: für beide Brands `no unresolved placeholders`. (Falls eine Variable fehlt: in die `envsubst`-Liste im Task UND hier aufnehmen.)

- [ ] **Step 4: Taskfile-Syntax / dry-run**

Run:
```bash
cd /tmp/wt-flux-complete-removal
task --dry website:deploy ENV=mentolder >/dev/null 2>&1 && echo "dry-run OK" || task --dry website:deploy ENV=mentolder 2>&1 | tail -20
```
Expected: `dry-run OK` (oder zumindest kein YAML/Template-Parsefehler im Taskfile).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add Taskfile.yml
git commit -m "feat(website): wire prod-fleet/website-<brand> overlay into website:deploy [T000146]

Closes the source-of-truth gap: the TLS Ingress/IngressRoute + middlewares were
never applied by any task. Prod now applies the brand overlay (single source)
via kustomize build | envsubst | sed | apply --server-side, replacing the
imperative website.yaml apply. environments/<env>.yaml stays the brand-config source.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: manifests.bats Pfad-Repoint

**Files:**
- Modify: `tests/unit/manifests.bats:475` (flux/apps/website-mentolder → prod-fleet/website-mentolder)

- [ ] **Step 1: Aktuelle Zeile inspizieren**

Run: `cd /tmp/wt-flux-complete-removal && grep -n 'flux/apps/website-mentolder' tests/unit/manifests.bats`
Expected: 1 Treffer (~Zeile 475) im Test „website overlay allows egress to workspace-office".

- [ ] **Step 2: Pfad ersetzen**

Ersetze in `tests/unit/manifests.bats` `${PROJECT_DIR}/flux/apps/website-mentolder` durch `${PROJECT_DIR}/prod-fleet/website-mentolder` (nur dieses eine Vorkommen).

- [ ] **Step 3: Test laufen lassen**

Run: `cd /tmp/wt-flux-complete-removal && bats tests/unit/manifests.bats`
Expected: alle Tests PASS (die `allow-egress-to-workspace-office` NetworkPolicy steckt transitiv in `k3d/website.yaml`, der Pfad existiert jetzt unter prod-fleet).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add tests/unit/manifests.bats
git commit -m "test(manifests): repoint website-overlay egress test to prod-fleet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: flux/ Routing-Token entfernen (4 Quellen)

**Files:**
- Modify: `CLAUDE.md:11`, `.claude/agents/bachelorprojekt-infra.md:7,28`, `scripts/plan-frontmatter-hook.sh:25`, `scripts/docs-gen/registry.test.mjs:53`

- [ ] **Step 1: CLAUDE.md infra-Routing-Zeile**

`CLAUDE.md` Zeile 11 — von:
```
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, `flux/`, deploy | `bachelorprojekt-infra` |
```
zu (Token `` `flux/`, `` entfernt):
```
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
```

- [ ] **Step 2: bachelorprojekt-infra.md Trigger + Bullet**

`.claude/agents/bachelorprojekt-infra.md` Zeile 7 — von:
```
  ENV=, environments/, flux/, deploy (when referring to k8s resources).
```
zu:
```
  ENV=, environments/, deploy (when referring to k8s resources).
```

Zeile 28 — die ganze Bullet-Zeile LÖSCHEN:
```
- `flux/apps/` — website kustomize overlays (ingress, security headers, config patches). Legacy dir name: the Flux GitOps machinery (`flux/clusters/`, `flux/images/`) was removed — **fleet is push-based, no reconciler**. Pending relocation out of `flux/`.
```
Optional ersetzen durch einen prod-fleet-Hinweis (falls eine passende prod-fleet-Bullet existiert, dort ergänzen): `website-mentolder/` und `website-korczewski/` liegen nun unter `prod-fleet/` und werden von `website:deploy` appliziert. Wenn unklar: Zeile ersatzlos streichen.

- [ ] **Step 3: plan-frontmatter-hook.sh Regex**

`scripts/plan-frontmatter-hook.sh` Zeile 25 — von:
```
    echo "$content" | grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|flux/|deploy.*k8s' \
```
zu (`flux/|` entfernt):
```
    echo "$content" | grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|deploy.*k8s' \
```

- [ ] **Step 4: registry.test.mjs Fixture-Zelle**

`scripts/docs-gen/registry.test.mjs` Zeile 53 — entferne das `` `flux/`, ``-Token aus der infra-Tabellenzelle (analog CLAUDE.md). Resultat:
```
  | \`k3d/\`, \`prod*/\`, manifest, kustomize, overlay, Taskfile, \`ENV=\`, \`environments/\`, deploy | \`bachelorprojekt-infra\` |
```

- [ ] **Step 5: registry-Test laufen lassen (Row-Count bleibt 6)**

Run: `cd /tmp/wt-flux-complete-removal && node --test scripts/docs-gen/registry.test.mjs 2>&1 | tail -15`
Expected: alle Tests PASS — `parseRoutingTable` liefert weiter exakt 6 Zeilen + dieselben 6 Agent-Namen (Token-Entfernung ändert keine Zeile/Spalte).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add CLAUDE.md .claude/agents/bachelorprojekt-infra.md scripts/plan-frontmatter-hook.sh scripts/docs-gen/registry.test.mjs
git commit -m "chore(routing): drop dead flux/ routing trigger (dir removed)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Docs-HTML + Test-Inventory regenerieren

**Files:**
- Regenerate (NICHT von Hand editieren): `k3d/docs-content-built/agents.html`
- Regenerate: `website/src/data/test-inventory.json`

- [ ] **Step 1: Docs-HTML regenerieren**

Run:
```bash
cd /tmp/wt-flux-complete-removal
node scripts/build-docs.mjs 2>&1 | tail -5
git status --short k3d/docs-content-built/
```
Expected: Build läuft durch; `agents.html` (und ggf. abhängige Seiten) als modified gelistet.

- [ ] **Step 2: Diff-Scope prüfen**

Run: `cd /tmp/wt-flux-complete-removal && git diff k3d/docs-content-built/agents.html | grep -iE '^[-+].*flux' | head`
Expected: das Diff zeigt im Wesentlichen die Entfernung des `flux/`-Tokens in der infra-Card. Falls unerwartete, unzusammenhängende Regenerierung auftaucht (andere Seiten/Knoten): NUR die intendierten Datei-Deltas stagen, oder vorher auf frischem `origin/main` rebasen.

- [ ] **Step 3: Test-Inventory regenerieren (CI failt sonst bei Drift)**

Run:
```bash
cd /tmp/wt-flux-complete-removal
task test:inventory 2>&1 | tail -5
git status --short website/src/data/test-inventory.json
```
Expected: `test-inventory.json` aktualisiert (neue Test-Namen aus dem umgebauten keycloak-Test). Falls keine Änderung: ok.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-flux-complete-removal
git add k3d/docs-content-built/ website/src/data/test-inventory.json
git commit -m "chore(docs): regenerate agents.html + test-inventory after flux/ token removal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Finale Gates (offline) + PR-Vorbereitung

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Offline-Suite**

Run: `cd /tmp/wt-flux-complete-removal && task test:all 2>&1 | tail -30`
Expected: GRÜN (BATS unit inkl. umgebauter keycloak/manifests-Tests, kustomize manifest structure, Taskfile dry-run).

- [ ] **Step 2: Manifest-Validierung**

Run: `cd /tmp/wt-flux-complete-removal && task workspace:validate 2>&1 | tail -20`
Expected: GRÜN.

- [ ] **Step 3: Letzter Flux-Reste-Scan (Sanity)**

Run:
```bash
cd /tmp/wt-flux-complete-removal
echo "dir:"; ls flux/ 2>/dev/null || echo "  flux/ gone"
echo "markers:"; grep -rIn 'fluxcd.io\|\$imagepolicy' k3d/ prod/ prod-fleet/ 2>/dev/null || echo "  none"
echo "routing token:"; grep -rIn '\`flux/\`\|flux/|' CLAUDE.md .claude/agents/bachelorprojekt-infra.md scripts/plan-frontmatter-hook.sh scripts/docs-gen/registry.test.mjs 2>/dev/null || echo "  none"
```
Expected: `flux/ gone`, `none`, `none`. (Korrekte Push-based-Doku in CLAUDE.md:167 / CONTRIBUTING.md / Guards in discover-versions/mandatory-sequences bleiben — sind KEIN Treffer hier.)

- [ ] **Step 4: Push + PR (CI-Gate)**

```bash
cd /tmp/wt-flux-complete-removal
git push -u origin feature/flux-complete-removal
gh pr create --fill --base main \
  --title "Remove Flux completely; relocate website overlays → prod-fleet [T000146]" \
  --body "$(cat <<'BODY'
## Was

- Entfernt das verbliebene `flux/`-Verzeichnis, inerte `$imagepolicy`/`reconcile`-Marker und das `flux/`-Routing-Token.
- Verschiebt die live Website-Overlays `flux/apps/website-{brand}/` → `prod-fleet/website-{brand}/` (geslimmt auf das echte additive Delta).
- Verdrahtet sie als Single-Source in `website:deploy` (prod) → schließt den T000146-Gap (TLS-Ingress/IngressRoute + Middlewares wurden bisher von keinem Task appliziert).

## Funktionsrisiko (Keycloak-Realm-Import-Escaping) — abgesichert

Das `$$`-Escaping in `prod/import-entrypoint.sh` wird **weiterhin vom Push-Deploy-`sed`-Collapse** (`Taskfile.yml:1724/1831`) gebraucht, nicht nur von Flux. Verifiziert: Render durch die echte Pipeline ergibt valides POSIX-sh, identisch zum erprobten Dev-Script. → **unverändert**. Der Guard-Test wurde umgeschrieben (Push-`sed`-Begründung) + ein Render-Parity-Regressionstest („tested realm import") ergänzt.

## Tests

- `tests/unit/keycloak-entrypoint-escaping.bats` (4 Tests, inkl. Parity)
- `kustomize build prod-fleet/website-{mentolder,korczewski}` grün
- `tests/unit/manifests.bats` (Pfad-Repoint), `registry.test.mjs` (6 Zeilen), `task test:all`, `task workspace:validate`

## Post-Merge (push-based, kein Reconciler)

`task website:deploy ENV=mentolder` UND `ENV=korczewski`; danach verifizieren, dass `ingress website-ingress-web` (website ns) bzw. `ingressroute,middleware` (website-korczewski ns) live existieren und `web.<domain>` HTTPS liefert. Optional `task docs:deploy` für die regenerierte HTML.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Post-Merge-Deploy (NICHT Teil der Plan-Ausführung — durch dev-flow-execute nach Merge)

1. `task website:deploy ENV=mentolder` und `task website:deploy ENV=korczewski` (push-based; kein Reconciler).
2. Verifizieren: `kubectl --context fleet -n website get ingress website-ingress-web`; `kubectl --context fleet -n website-korczewski get ingressroute,middleware`; `web.mentolder.de`/`web.korczewski.de` liefern HTTPS (T000146 geschlossen).
3. Optional `task docs:deploy` (Docker-Build + Rollout der regenerierten Docs-HTML auf beiden Brands).

## Self-Review-Notizen (Spec-Coverage)

- §2 Escaping → Task 1. §4/§5 Overlay-Slim + Wiring → Tasks 2/3/5. §6a Marker → Task 4. §6b Routing-Token → Task 7. §6c Updates → Tasks 5/6. §6d Regenerate → Task 8. §6e Leave-alone → bewusst keine Tasks. §7 Test-Plan → Tasks 1/2/3/5/6/9. §8 Risiken → in den jeweiligen Verifikationsschritten adressiert (Render-Check, Digest-Pin-Reihenfolge, Affinity-Single-Owner).
