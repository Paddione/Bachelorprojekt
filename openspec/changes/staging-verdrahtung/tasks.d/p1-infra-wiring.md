# Partial p1 — Infra-Verdrahtung: Renderer, Website-Overlay, Flux-Kustomizationen

## Scope

Staging voll in den GitOps-Pfad bringen: Renderer emittiert die Staging-Bäume,
Website-Staging-Overlay entsteht nach Brand-Muster, Flux-Kustomizationen verdrahten
Artefakt → Cluster, Env-Profil bekommt die Offline-Digest-Placeholder.

## Task List

- [ ] **1.1 `environments/staging.yaml` — Digest-Placeholder ergänzen.** Im Block
      `env_vars` neben dem bestehenden `WEBSITE_IMAGE: website` die Offline-Fallbacks
      einfügen, exakt im Muster von `environments/fleet-mentolder.yaml:23–26`:
      `WEBSITE_IMAGE_DIGEST: sha256:1111…1`, `BRETT_IMAGE: workspace-brett`,
      `BRETT_IMAGE_DIGEST: sha256:2222…2` (Platzhalter-Digests sind der dokumentierte
      Offline-Fallback; CI setzt echte Digests via `scripts/resolve-image-digest.sh`,
      der Placeholder-Guard T004041 blockiert sie im finalen Artefakt).
- [ ] **1.2 `prod-fleet/website-staging/` — Overlay NEU (4 Dateien), geklont von
      `prod-fleet/website-mentolder/` mit diesen Adaptionspunkten:**
      1. `kustomization.yaml`: `namespace: website-staging`; resources wie mentolder
         (`../../k3d/website.yaml`, `../../k3d/website-seller-config.yaml`,
         `../website-common/domain-config.yaml`, `website-security-headers.yaml`,
         `website-ingress-web.yaml`) + patches auf `website-patch.yaml`.
      2. `website-patch.yaml`: unverändert übernehmen (`image:
         ghcr.io/paddione/${WEBSITE_IMAGE}@${WEBSITE_IMAGE_DIGEST}`).
      3. `website-ingress-web.yaml`: hosts `web.${PROD_DOMAIN}` (staging-Profil liefert
         `web.staging.korczewski.de`); `secretName: ${TLS_SECRET_NAME}`
         (= `staging-wildcard-tls`); Traefik-Middleware-Präfixe umbauen auf
         `${WORKSPACE_NAMESPACE}-redirect-https@kubernetescrd`,
         `${WORKSPACE_NAMESPACE}-hsts-headers@kubernetescrd`,
         `${WEBSITE_NAMESPACE}-website-security-headers@kubernetescrd`,
         `${WORKSPACE_NAMESPACE}-rate-limit-web@kubernetescrd`,
         `${WEBSITE_NAMESPACE}-website-compress@kubernetescrd` (im Prod-Klon stehen die
         Präfixe hart als `workspace-…`/`website-…` — hier envsubst-fähig schreiben);
         Astro-Ingress (zweites Doc) analog mitpräfixieren.
      4. `website-security-headers.yaml`: aus website-mentolder übernehmen und
         Namespace auf `website-staging` setzen.
- [ ] **1.3 `scripts/flux-render-artifact.sh` — Render-Blöcke + Gate.** Nach dem
      Website-Korczewski-Block (Schritt 5) einfügen:
      1. Staging-App-Stack: Subshell mit `set +u`, `source scripts/env-resolve.sh
         staging`, `apply_schema_defaults`, Image-Override-Exports (gleiches Muster wie
         die Brand-Blöcke), `mkdir -p "${OUT_DIR}/staging"`,
         `render_component prod-fleet/staging "${OUT_DIR}/staging/staging.yaml"`.
      2. Website-Staging: analog mit `render_component prod-fleet/website-staging
         "${OUT_DIR}/website-staging/website-staging.yaml"`.
      3. Sealed Secrets: `mkdir -p "${OUT_DIR}/sealed-secrets/staging"` +
         `cp environments/sealed-secrets/staging.yaml
         "${OUT_DIR}/sealed-secrets/staging/staging.yaml"`.
      4. Validation-Gate: `"${OUT_DIR}/staging"` und `"${OUT_DIR}/website-staging"`
         in die Tree-Liste der for-Schleife aufnehmen.
- [ ] **1.4 `flux/clusters/fleet/ks-staging.yaml` — NEU.** Kustomization
      `flux-staging` im flux-system-Namespace nach ks-mentolder-Muster:
      interval 10m, retryInterval 5m, timeout 10m, `dependsOn: [flux-infra-controllers]`,
      sourceRef OCIRepository fleet-manifests, `path: ./staging`, `prune: true`,
      `wait: true`. KEIN healthChecks-Eintrag auf fremde Infrastruktur (T002313).
- [ ] **1.5 `flux/clusters/fleet/ks-website-staging.yaml` — NEU.** Kustomization
      `flux-website-staging` nach ks-website-mentolder-Muster: dependsOn
      flux-infra-controllers, path `./website-staging`, prune true, wait true.
- [ ] **1.6 `flux/clusters/fleet/ks-sealed-secrets.yaml` — drittes Dokument.** An das
      vorhandene Zwei-Doc-File einen dritten Kustomization-Block anhängen:
      `flux-sealed-secrets-staging`, path `./sealed-secrets/staging`, prune false,
      wait true (Muster der beiden Brands, `---`-getrennt).
- [ ] **1.7 `CLAUDE.md` — Flux-Abschnitt ergänzen.** Im Architecture-Absatz zur
      Pull-based-Deploy-Verdrahtung Staging als dritten Stack nennen: ks-staging
      rendert `prod-fleet/staging` nach `workspace-staging`, ks-website-staging
      deployt die Website nach `website-staging`, Env-Profil `environments/staging.yaml`.

## Verification

```bash
# Renderer-Trockenprobe: beide neuen Bäume bauen unter dem staging-Profil
source scripts/env-resolve.sh staging
kustomize build prod-fleet/staging --load-restrictor=LoadRestrictionsNone | grep -c 'kind: CronJob'
kustomize build prod-fleet/website-staging --load-restrictor=LoadRestrictionsNone | grep -c 'namespace: website-staging'
# Placeholder-Gate bleibt grün (Runtime-Vars ausgenommen)
# Flux-Dateien vorhanden und korrekt gerichtet
grep -n 'path: ./staging' flux/clusters/fleet/ks-staging.yaml
grep -n 'path: ./website-staging' flux/clusters/fleet/ks-website-staging.yaml
grep -n 'flux-sealed-secrets-staging' flux/clusters/fleet/ks-sealed-secrets.yaml
```
