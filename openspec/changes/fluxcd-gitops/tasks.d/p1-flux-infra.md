---
title: "fluxcd-gitops · p1-flux-infra — Implementation Plan (Partial)"
ticket_id: T002083
domains: [infra, ci]
status: active
partial_id: p1-flux-infra
---

# fluxcd-gitops · p1-flux-infra — Implementation Plan (Partial)

_Ticket: T002083 — Partial p1 of change `fluxcd-gitops`. Owns the cluster-side
Flux resources, the render script, the Taskfile bootstrap/render/push verbs, an
optional CI-no-secrets mode for `env-resolve.sh`, and the two OpenSpec delta
specs. The RED→GREEN failing-test step and BATS/CI-workflow rewrites live in the
sibling partials (p2 CI-workflows, p3 tests) — this partial deliberately carries
no `expected: FAIL` step._

## File Structure

| `path` | Ist (`wc -l`) | Budget |
|--------|---------------|--------|
| `flux/clusters/fleet/flux-instance.yaml` | new | n/a (yaml, ungated) |
| `flux/clusters/fleet/ks-sealed-secrets.yaml` | new | n/a |
| `flux/clusters/fleet/ks-platform.yaml` | new | n/a |
| `flux/clusters/fleet/ks-mentolder.yaml` | new | n/a |
| `flux/clusters/fleet/ks-korczewski.yaml` | new | n/a |
| `flux/clusters/fleet/ks-website-mentolder.yaml` | new | n/a |
| `flux/clusters/fleet/ks-website-korczewski.yaml` | new | n/a |
| `flux/clusters/fleet/bootstrap/receiver.yaml` | new | n/a |
| `flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml` | new | n/a |
| `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` | new | n/a |
| `flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` | new | n/a |
| `scripts/flux-render-artifact.sh` | new (0) | 500 (`.sh` limit 500, not baselined) |
| `scripts/env-resolve.sh` | 115 | 385 (limit 500 − 115; not baselined) |
| `Taskfile.yml` | 4651 | ungated (`.yml`) |
| `openspec/changes/fluxcd-gitops/specs/workspace-deploy.md` | delta (authored here) | n/a |
| `openspec/changes/fluxcd-gitops/specs/ci-cd.md` | delta (authored here) | n/a |

Notes on layout inside `flux/clusters/fleet/`:

- **Top level** (`ks-*.yaml` + `flux-instance.yaml`): the reconciled `Kustomization`
  CRs. The render script copies the top level into the OCI artifact under
  `clusters/fleet/`; the `FluxInstance.spec.sync.path` points at exactly this
  directory, so Flux applies these CRs on every reconcile.
- **`bootstrap/` subdir**: resources applied **imperatively** by `flux:bootstrap`
  (chicken-and-egg — they cannot be reconciled by a Flux that does not exist yet):
  the `Receiver`, its `IngressRoute`, the `ghcr-auth` pull-secret, and the webhook
  token. The render script **excludes** `bootstrap/` from the artifact.

---

### Task 1: ENVSUBST-Secret-Audit (Blocker-Gate, zuerst)

**Ziel:** Beweisen, dass der Render-Job keinen Secret-Wert in ein gerendertes
Manifest zieht (sonst Leak ins OCI-Artefakt — design.md §Risiken #2). Dieser Task
ist ein **Blocker**: schlägt er an, darf keiner der folgenden Tasks starten, bevor
der Befund aufgelöst ist.

**Betroffene Dateien:** `Taskfile.yml` (ENVSUBST_VARS 2757–2786), `environments/schema.yaml`
(`env_vars:` vs. `secrets:`), `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`.

**Steps:**

1. Jeden Namen aus `ENVSUBST_VARS` gegen den `secrets:`-Block von
   `environments/schema.yaml` prüfen:

   ```bash
   # ENVSUBST-Namen extrahieren (Zeilen 2757–2786)
   sed -n '2757,2786p' Taskfile.yml \
     | grep -oE '\$[A-Z][A-Z0-9_]+' | tr -d '$' | sort -u > /tmp/envsubst-vars.txt
   # secret-deklarierte Namen aus dem secrets:-Block
   awk '/^secrets:/{s=1} /^[a-z_]+:/{if($1!="secrets:")s=0} s&&/^[[:space:]]*- name:/{print $3}' \
     environments/schema.yaml | sort -u > /tmp/secret-vars.txt
   # Schnittmenge = potenzieller Leak
   comm -12 /tmp/envsubst-vars.txt /tmp/secret-vars.txt
   ```

2. **Bekannter Befund (bereits verifiziert):** `STUDIO_DB_URL` steht im
   `secrets:`-Block (`environments/schema.yaml:511`) **und** ist ENVSUBST-Target
   (`Taskfile.yml:2764`). Prüfen, welchen Wert `fleet-mentolder.yaml` /
   `fleet-korczewski.yaml` tatsächlich liefern:

   ```bash
   for e in fleet-mentolder fleet-korczewski; do
     ( set +e; source scripts/env-resolve.sh "$e" 2>/dev/null; \
       echo "$e STUDIO_DB_URL=${STUDIO_DB_URL:-<unset>}" )
   done
   ```

   - Enthält der aufgelöste Wert ein **literales** Passwort → Blocker: den Wert
     aus dem gerenderten Manifest herausnehmen (in ein SealedSecret verlagern oder
     als Postgres-Runtime-Referenz `$(WEBSITE_DB_PASSWORD)` belassen, die erst im
     Pod aufgelöst wird und **nicht** durch `envsubst` läuft — der `$(...)`-Syntax
     ist kein `envsubst`-Target).
   - Enthält er nur `$(WEBSITE_DB_PASSWORD)` (Runtime-Referenz, kein Klartext) →
     kein Leak, dokumentieren.

3. Das Render-Skript (Task 3) substituiert **ausschließlich** die
   Nicht-Secret-Teilmenge. Der Audit legt die Allowlist fest, die Task 3 als
   `FLUX_RENDER_ENVSUBST_VARS` verwendet (= `ENVSUBST_VARS` minus Schnittmenge aus
   Step 1, bzw. minus jeder als Klartext-Secret bestätigte Name).

**Acceptance:**
- Der `comm -12`-Befund ist entweder leer **oder** jeder gelistete Name ist
  nachweislich (a) eine Runtime-`$(...)`-Referenz ohne Klartext oder (b) aus dem
  Render-Allowlist entfernt.
- Der Befund (inkl. `STUDIO_DB_URL`-Auflösung pro fleet-Env) ist im PR-Body
  dokumentiert.

---

### Task 2: Inventur der einzeln applizierten Manifeste

**Ziel:** Alles, was `workspace:deploy` heute **außerhalb** des Kustomize-Overlays
appliziert, ins Artefakt aufnehmen — sonst driftet es weiter bzw. `prune: true`
kann es nicht managen (design.md §Risiken #3).

**Betroffene Dateien:** `Taskfile.yml` (2724–2746, 2837–2851), Analyse; Ergebnis fließt
in die Overlay-Zuordnung des Render-Vertrags (Task 3) und die `platform`-Komponente.

**Steps:**

1. Die separat applizierten Manifeste erfassen:
   - `k3d/shared-db.yaml` (namespace-sed vor Overlay-Apply, `Taskfile.yml:2742`)
   - `k3d/tests-retention-cronjob.yaml` (`:2841`)
   - `k3d/cicd-deploy-sa.yaml` (`:2843`)
   - `k3d/pocket-id-client-seed-website-rbac.yaml` (`:2846`)
   - `k3d/cronjob-systemtest-cleanup.yaml` (`:2850`)
2. Pro Manifest entscheiden und im Plan-Anhang festhalten:
   - **Aufnahme ins Overlay** (bevorzugt): als `resources:`-Eintrag in
     `prod-fleet/<brand>/kustomization.yaml` bzw. `prod-fleet/platform/kustomization.yaml`,
     damit der Render die Datei ohnehin mitzieht. Die `WEBSITE_NAMESPACE`-Sonderfälle
     (Role/RoleBinding in `website`-ns statt `workspace`) bleiben über die bestehende
     namespace-Logik der Manifeste erhalten.
   - **Verbleib imperativ** (nur `cicd-deploy-sa`, falls es das CI-Token trägt, das
     Flux gerade ablösen soll): dokumentierter Ausnahmegrund.
3. Diese Zuordnung ist Input für den Render-Vertrag: das Render-Skript rendert
   **genau** die Overlays, in denen die inventarisierten Manifeste referenziert sind.

**Acceptance:**
- Jedes der fünf Manifeste hat einen dokumentierten Verbleib (Overlay-Pfad oder
  begründete imperative Ausnahme).
- Kein inventarisiertes Manifest fällt zwischen Overlay und Artefakt durch (keine
  Ressource, die weder gerendert noch bewusst imperativ bleibt).

---

### Task 3: `scripts/flux-render-artifact.sh` — Render-Pipeline

**Ziel:** Eine einzige, wiederverwendbare Render-Funktion (CI + lokaler
Break-Glass), die pro Komponente mit der bestehenden
`kustomize build | sed | envsubst | sed`-Pipeline nach `out/` rendert, die
SealedSecrets und die reconciled Flux-CRs dazukopiert und **keine** Secret-Werte
substituiert.

**Betroffene Dateien:** `scripts/flux-render-artifact.sh` (neu, S1-Budget 500),
liest `scripts/env-resolve.sh`.

**Steps:**

1. Signatur: `scripts/flux-render-artifact.sh --out <dir> [--website-image <tag>] [--brett-image <tag>]`.
   Rendert alle Komponenten in `<dir>` (Standard `out/`). Das `--out`-Flag ist der
   Test-Vertrag von p3 (`tests/spec/workspace-deploy.bats`) und der Aufruf-Vertrag
   von p2 (`render-fleet-artifact.yml` reicht `WEBSITE_IMAGE_TAG`/`BRETT_IMAGE_TAG`
   als Inputs durch → hier als `--website-image`/`--brett-image` entgegennehmen und
   vor dem envsubst als `WEBSITE_IMAGE`/`BRETT_IMAGE` exportieren). Ohne die Flags
   gelten die Werte aus `environments/fleet-*.yaml`. Muss **offline** laufen
   (kein Cluster-Zugriff; nur env-resolve im no-secrets-Modus aus Task 4).
2. Die Substitutions-Pipeline 1:1 aus `Taskfile.yml:2832–2836` übernehmen — inkl.
   des `$$`-Escapes (T001673), das sonst DB-Passwörter zu `<PID>{VAR}` macht:

   ```bash
   render_component() {
     local overlay="$1" out="$2"
     kustomize build "$overlay" --load-restrictor=LoadRestrictionsNone \
       | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
       | envsubst "$FLUX_RENDER_ENVSUBST_VARS" \
       | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
       > "$out"
   }
   ```

   `FLUX_RENDER_ENVSUBST_VARS` ist die in Task 1 abgesegnete Allowlist (Secrets
   ausgeschlossen).
3. Artefakt-Struktur aufbauen (Pfad-Namen exakt wie die `path:`-Felder der
   Kustomization-CRs in Task 6):

   ```
   out/
     sealed-secrets/    ← environments/sealed-secrets/fleet-{mentolder,korczewski}.yaml
                          (yq-Brand-Filterung wie workspace:deploy 2685–2702)
     platform/          ← render_component prod-fleet/platform
     mentolder/         ← render_component prod-fleet/mentolder   (ENV=fleet-mentolder)
     korczewski/        ← render_component prod-fleet/korczewski  (ENV=fleet-korczewski)
     website-mentolder/ ← render_component prod-fleet/website-mentolder
     website-korczewski/← render_component prod-fleet/website-korczewski
     clusters/fleet/    ← cp flux/clusters/fleet/*.yaml   (Top-Level, OHNE bootstrap/)
   ```

4. Env pro Brand über `source scripts/env-resolve.sh fleet-<brand>` laden (Sub-Shell
   je Brand, damit exportierte Vars nicht zwischen Brands lecken).
5. `--website-image` überschreibt `WEBSITE_IMAGE` vor dem Render (Build-Workflows
   reichen ihr SHA-Tag durch — die Substitution selbst bleibt hier, kein
   `kubectl set image`).
6. SealedSecrets werden **kopiert, nicht gerendert** (placeholder-frei, dürfen nie
   durch `envsubst`).
7. Die `bootstrap/`-Ressourcen werden **nicht** kopiert (nur `flux/clusters/fleet/*.yaml`
   Top-Level via `find … -maxdepth 1`).
8. S4-Erreichbarkeit: das Skript wird von `flux:render` (Task 8) aufgerufen → kein
   Orphan.

**Acceptance:**
- `bash scripts/flux-render-artifact.sh --out out/` erzeugt alle sieben Pfade; `out/**`
  enthält **keine** literalen `${...}`-Tokens der Allowlist mehr (`! grep -rE '\$\{[A-Z_]+\}' out/`).
- `out/**` enthält **keinen** Klartext-Secret-Wert (Stichprobe gegen die in Task 1
  bestätigten Secret-Namen).
- `out/clusters/fleet/` enthält die reconciled `ks-*.yaml`, aber **keine**
  `bootstrap/`-Datei.
- `wc -l scripts/flux-render-artifact.sh` ≤ 500.

---

### Task 3b: `${BRETT_IMAGE}`-envsubst-Var einführen (Rollout-Vertrag für p2)

**Ziel:** Brett läuft heute hart auf `ghcr.io/paddione/workspace-brett:latest`
(`k3d/brett.yaml:34`) und wird per `kubectl rollout restart` aus CI neu gestartet.
Unter Flux ist ein Restart-Drift und der Re-Render ein No-op, solange sich die
Podspec nicht ändert. Lösung nach dem `WEBSITE_IMAGE`-Vorbild (`k3d/website.yaml:210`):
das Tag wird envsubst-Variable, p2 reicht das SHA-Tag beim Re-Render durch.

**Betroffene Dateien:** `k3d/brett.yaml`, `environments/schema.yaml`,
`environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`,
`Taskfile.yml` (ENVSUBST_VARS-Liste).

**Steps:**

1. `k3d/brett.yaml:34`: `image: ghcr.io/paddione/workspace-brett:${BRETT_IMAGE}`.
2. `environments/schema.yaml`: Var `BRETT_IMAGE` registrieren (analog `WEBSITE_IMAGE`,
   `environments/schema.yaml:100`), Default `latest` — damit bleiben dev/k3d und der
   Break-Glass-Pfad unverändert lauffähig.
3. `environments/fleet-mentolder.yaml` + `environments/fleet-korczewski.yaml`:
   `BRETT_IMAGE: latest` als expliziten Startwert eintragen.
4. `BRETT_IMAGE` in die `ENVSUBST_VARS`-Liste von `workspace:deploy`
   (`Taskfile.yml:2757-2786`) UND in die `FLUX_RENDER_ENVSUBST_VARS`-Allowlist
   (Task 3) aufnehmen.
5. Render-Skript (Task 3): `--brett-image <tag>` überschreibt `BRETT_IMAGE` vor dem
   envsubst — der Vertrag, den `render-fleet-artifact.yml` (p2, Input
   `BRETT_IMAGE_TAG`) nutzt.

**Acceptance:**
- `task workspace:deploy ENV=mentolder --dry` bzw. der gerenderte Output enthält
  `workspace-brett:latest` (Default) ohne literales `${BRETT_IMAGE}`.
- `bash scripts/flux-render-artifact.sh --out out/ --brett-image sha-abc123` rendert
  `workspace-brett:sha-abc123` in beide Brand-Pfade.
- `task env:validate` grün (Schema kennt die neue Var).

---

### Task 4: `scripts/env-resolve.sh` — CI-tauglicher no-secrets-Modus (bedingt)

**Ziel:** In CI laufen die Renders ohne git-crypt-entschlüsselte
`environments/.secrets/*.yaml`. `env-resolve.sh` exportiert heute nur
`env_vars`/`setup_vars` aus `environments/<env>.yaml` + Schema-Defaults — Secrets
liegen ohnehin nicht darin. Falls der Render trotzdem über eine fehlende
Nicht-Secret-Var stolpert, hier einen expliziten `--no-secrets`-Pfad ergänzen, der
Secret-deklarierte Vars leer lässt statt zu faulten.

**Betroffene Dateien:** `scripts/env-resolve.sh` (Ist 115, Budget 385).

**Steps:**

1. Zuerst **verifizieren, ob überhaupt nötig**: Task 3 im CI-Kontext (ohne
   entschlüsselte Secrets) trocken laufen lassen. Rendert er sauber, entfällt
   dieser Task komplett (dann als „nicht nötig" dokumentieren).
2. Falls nötig: optionales drittes Argument/Flag `--no-secrets`, das im
   python3/PyYAML-Block Einträge aus dem `secrets:`-Block überspringt (leerer
   Export statt Abbruch). Die bestehende `env_vars`/`setup_vars`-Logik bleibt
   unangetastet.

**Acceptance:**
- Entweder: Task 3 rendert in CI-Umgebung ohne Secrets → dieser Task als „entfällt"
  markiert.
- Oder: `source scripts/env-resolve.sh fleet-mentolder --no-secrets` exportiert alle
  Nicht-Secret-Vars und bricht nicht ab; `wc -l scripts/env-resolve.sh` ≤ 500.

---

### Task 5: `FluxInstance` (flux/clusters/fleet/flux-instance.yaml)

**Ziel:** Der pull-based Reconciler. `FluxInstance` erzeugt die
`source-controller`/`kustomize-controller`/`notification-controller` und eine
`sync`-`OCIRepository` + `Kustomization` namens `flux-system` (Default:
`sync.name` = Namespace-Name), die auf das OCI-Artefakt zeigt.

**Betroffene Dateien:** `flux/clusters/fleet/flux-instance.yaml` (neu).

**Steps (schema-verifiziert gegen `fluxcd.controlplane.io/v1`):**

```yaml
apiVersion: fluxcd.controlplane.io/v1
kind: FluxInstance
metadata:
  name: flux
  namespace: flux-system
spec:
  distribution:            # required
    version: "2.x"         # required — semver expr; später gegen environments/versions.yaml pinnen
    registry: "ghcr.io/fluxcd"  # required
  components:
    - source-controller
    - kustomize-controller
    - notification-controller
  cluster:
    type: kubernetes
    networkPolicy: true    # default true — kompatibel zur bestehenden netpol-Struktur
  sync:
    kind: OCIRepository            # required (enum OCIRepository|GitRepository|Bucket)
    url: "oci://ghcr.io/paddione/fleet-manifests"  # required
    ref: latest                   # required — OCI-Tag
    path: clusters/fleet          # required — Artefakt-Pfad mit den ks-*.yaml
    pullSecret: ghcr-auth         # Secret type kubernetes.io/dockerconfigjson
    interval: 10m                 # Failsafe-Polling (Receiver triggert sonst sofort)
```

**Verifikations-Notiz:** `spec.distribution` ist Pflicht (`registry`+`version`
required); `spec.sync.{kind,url,ref,path}` sind Pflicht; `pullSecret` optional. Die
von `sync` erzeugte Source heißt `flux-system` (Default = Namespace-Name) — genau
der `sourceRef.name`, den die Kustomization-CRs in Task 6 referenzieren.

**Acceptance:**
- `flux install --export`-freier Manifest-Lint: `kubectl apply --dry-run=server`
  (nach `flux:bootstrap`) akzeptiert die Datei.
- Keine Felder außerhalb des verifizierten Schemas.

---

### Task 6: Kustomization-CRs mit dependsOn-Kette (flux/clusters/fleet/ks-*.yaml)

**Ziel:** Die Reconcile-Kette sealed-secrets → platform → {brands, websites} mit
Drift-Korrektur (`prune`/`wait`), aber `prune: false` für SealedSecrets (Secrets
nie automatisch löschen).

**Betroffene Dateien:** `flux/clusters/fleet/ks-sealed-secrets.yaml`, `ks-platform.yaml`,
`ks-mentolder.yaml`, `ks-korczewski.yaml`, `ks-website-mentolder.yaml`,
`ks-website-korczewski.yaml` (alle neu).

**Steps (schema-verifiziert gegen `kustomize.toolkit.fluxcd.io/v1` — `spec.prune`
und `spec.sourceRef` sind Pflicht):**

`ks-sealed-secrets.yaml` (Wurzel der Kette, `prune: false`):

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-sealed-secrets
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 2m
  timeout: 5m
  sourceRef:
    kind: OCIRepository      # required
    name: flux-system        # von der FluxInstance-sync erzeugte Source
  path: ./sealed-secrets
  prune: false               # required-Feld; false = Secrets nie GC-en
  wait: true
```

`ks-platform.yaml` (`dependsOn: flux-sealed-secrets`, `prune: true`):

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-platform
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 2m
  timeout: 5m
  dependsOn:
    - name: flux-sealed-secrets
  sourceRef:
    kind: OCIRepository
    name: flux-system
  path: ./platform
  prune: true
  wait: true
```

Die vier Blatt-Kustomizations (`ks-mentolder`, `ks-korczewski`,
`ks-website-mentolder`, `ks-website-korczewski`) folgen demselben Muster mit
`dependsOn: [{ name: flux-platform }]`, `path: ./<komponente>`, `prune: true`,
`wait: true`. **Kein** `targetNamespace` setzen — die Ziel-Namespaces
(`workspace` / `workspace-korczewski` / `website`) kommen aus den Overlays; ein
`targetNamespace` würde sie global überschreiben.

**Verifikations-Notiz:** `spec.prune` ist im Schema als `(required)` markiert — jede
CR muss es explizit setzen. `dependsOn[].name` ist Pflicht; `dependsOn` referenziert
nur andere Kustomizations.

**Acceptance:**
- `flux tree kustomization flux-platform` (nach Bootstrap) zeigt die Kette; jede CR
  wird `Ready=True`.
- Eine manuelle `kubectl edit` an einer gemanagten Ressource wird binnen eines
  Intervalls zurückgedreht (Drift-Self-Heal-Nachweis gehört als E2E nach p3).
- Kein `ks-*.yaml` setzt `targetNamespace`.

---

### Task 7: Receiver + IngressRoute + ghcr-auth + Webhook-Token (bootstrap/)

**Ziel:** Sofort-Reconcile per CI-Webhook statt reinem Intervall-Polling, plus die
imperativ zu applizierenden Bootstrap-Secrets.

**Betroffene Dateien:** `flux/clusters/fleet/bootstrap/receiver.yaml`,
`ingressroute-flux-webhook.yaml`, `ghcr-auth-sealedsecret.yaml`,
`flux-webhook-token-sealedsecret.yaml` (alle neu).

**Steps:**

1. `Receiver` (schema-verifiziert gegen `notification.toolkit.fluxcd.io/v1` —
   `spec.type` und `spec.resources` Pflicht):

   ```yaml
   apiVersion: notification.toolkit.fluxcd.io/v1
   kind: Receiver
   metadata:
     name: flux-webhook
     namespace: flux-system
   spec:
     type: generic            # required (enum incl. generic)
     secretRef:
       name: flux-webhook-token   # Secret mit key 'token'
     resources:               # required
       - kind: OCIRepository   # required; enum incl. OCIRepository
         name: flux-system
         namespace: flux-system
   ```

   Der öffentliche Pfad ergibt sich zur Laufzeit aus `status.webhookPath`
   (`/hook/sha256sum(token+name+namespace)`) — CI liest ihn per
   `kubectl get receiver flux-webhook -n flux-system -o jsonpath='{.status.webhookPath}'`
   bzw. der Push-Job kennt ihn über den gesealten Token.

2. `IngressRoute` (Traefik, TLS wie übrige Services). **Keine Brand-Domain-Literale
   (S3):** Der Host wird über `${FLUX_WEBHOOK_HOST}` platzhaltert und im
   `flux:bootstrap`-Task (Task 8) via `envsubst` aus
   `flux-webhook.${PROD_DOMAIN}` aufgelöst:

   ```yaml
   apiVersion: traefik.io/v1alpha1
   kind: IngressRoute
   metadata:
     name: flux-webhook
     namespace: flux-system
   spec:
     entryPoints: [websecure]
     routes:
       - match: Host(`${FLUX_WEBHOOK_HOST}`)
         kind: Rule
         services:
           - name: notification-controller
             port: 80
     tls:
       secretName: ${TLS_SECRET_NAME}
   ```

3. `ghcr-auth-sealedsecret.yaml`: `SealedSecret` (flux-system-ns) vom Typ
   `kubernetes.io/dockerconfigjson`, initial per `kubeseal` aus dem `GHCR_PAT`
   erzeugt (analog zum bisher imperativen `ghcr-pull-secret`, `Taskfile.yml:2710–2721`)
   — ersetzt genau diesen imperativen Schritt für flux-system.

4. `flux-webhook-token-sealedsecret.yaml`: `SealedSecret` mit key `token` (Receiver-
   Validierung), initial per `kubeseal` aus einem frischen Zufallstoken.

**Acceptance:**
- `receiver.yaml`/`ingressroute-flux-webhook.yaml` liegen unter `bootstrap/` und
  werden von Task 3 **nicht** ins Artefakt kopiert.
- `grep -RE '(mentolder|korczewski)\.(de)' flux/clusters/fleet/bootstrap/` liefert
  keine Code-Zeile (nur Platzhalter/Kommentare) — S3 sauber.
- Beide SealedSecrets sind git-committet und placeholder-frei.

---

### Task 8: Taskfile-Verben `flux:render`, `flux:bootstrap`, `flux:push` + Deprecation

**Ziel:** Bootstrap (einmalig imperativ), Render+Push (CI + Break-Glass) und ein
sichtbarer Deprecation-Hinweis auf `workspace:deploy`.

**Betroffene Dateien:** `Taskfile.yml` (neue Tasks; Kommentar-Hinweis in `workspace:deploy`).

**Steps:**

1. `flux:render` — ruft `scripts/flux-render-artifact.sh` auf (eine
   Substitutionslogik, kein Copy-Paste):

   ```yaml
   flux:render:
     desc: "Render fleet-Komponenten + Flux-CRs nach out/ (kein Apply)"
     cmds:
       - bash scripts/flux-render-artifact.sh --out "{{.OUT | default \"out\"}}"
   ```

2. `flux:bootstrap` — analog `sealed-secrets:install` (`Taskfile.yml:4120–4147`):
   `helm upgrade --install flux-operator`
   (`oci://ghcr.io/controlplaneio-fluxcd/charts/flux-operator`, Version aus
   `environments/versions.yaml` gepinnt sofern Key vorhanden), dann `envsubst`+Apply
   der `bootstrap/`-Ressourcen und der `FluxInstance`:

   ```yaml
   flux:bootstrap:
     desc: "Einmalig: flux-operator via Helm + FluxInstance + Receiver/IngressRoute/ghcr-auth (imperativ)"
     cmds:
       - |
         source scripts/env-resolve.sh "{{.ENV}}"
         export FLUX_WEBHOOK_HOST="${FLUX_WEBHOOK_HOST:-flux-webhook.${PROD_DOMAIN}}"
         helm upgrade --install flux-operator \
           oci://ghcr.io/controlplaneio-fluxcd/charts/flux-operator \
           --namespace flux-system --create-namespace \
           --kube-context "$ENV_CONTEXT"
         kubectl --context "$ENV_CONTEXT" apply -f flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml
         kubectl --context "$ENV_CONTEXT" apply -f flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml
         kubectl --context "$ENV_CONTEXT" apply -f flux/clusters/fleet/flux-instance.yaml
         kubectl --context "$ENV_CONTEXT" apply -f flux/clusters/fleet/bootstrap/receiver.yaml
         envsubst "\$FLUX_WEBHOOK_HOST \$TLS_SECRET_NAME" \
           < flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml \
           | kubectl --context "$ENV_CONTEXT" apply -f -
         flux check --context "$ENV_CONTEXT" || true
   ```

3. `flux:push` — rendert und pusht das Artefakt, dann Receiver-Ping:

   ```yaml
   flux:push:
     desc: "Render + flux push artifact (privates GHCR) + Receiver-Ping"
     cmds:
       - |
         task flux:render OUT=out
         flux push artifact \
           oci://ghcr.io/paddione/fleet-manifests:latest \
           --path=out \
           --source="$(git config --get remote.origin.url)" \
           --revision="main@sha1:$(git rev-parse HEAD)"
         # Receiver-Ping: Pfad aus status.webhookPath, Token aus dem gesealten Secret
   ```

   **Guard (design.md §Risiken #2b):** Das GHCR-Package `fleet-manifests` MUSS als
   **privates** Package existieren (gerenderte Manifeste = interne Topologie). Als
   Kommentar + Pre-Push-Check dokumentieren.

4. `workspace:deploy` Deprecation: Kommentarblock oben im Task-Body — push-based ist
   ab jetzt **Break-Glass**; vor manuellem Einsatz erst
   `flux suspend kustomization <name>`, sonst dreht die Drift-Korrektur den Hotfix
   zurück. Kein funktionaler Rückbau in diesem Change (Task bleibt lauffähig).

**Acceptance:**
- `task flux:render OUT=out` und `task -n flux:bootstrap` / `task -n flux:push`
  (Dry-Run) laufen ohne Task-Parse-Fehler.
- `workspace:deploy` trägt den sichtbaren Deprecation-/`flux suspend`-Hinweis.
- Kein `kubectl set image`/`rollout restart` in den neuen Tasks.

---

### Task 9: Delta-Specs authoren (workspace-deploy.md + ci-cd.md)

**Ziel:** Die SSOT-Verbote gegen Flux umkehren und den pull-based Pfad als
Requirement festschreiben — sonst schlägt `task test:all` fehl (design.md §Risiken #4).
Die beiden Delta-Dateien werden in **diesem** Task direkt angelegt (Plan-Artefakte,
keine Implementierung).

**Betroffene Dateien:** `openspec/changes/fluxcd-gitops/specs/workspace-deploy.md`
(Skeleton ersetzen), `openspec/changes/fluxcd-gitops/specs/ci-cd.md` (neu).

**Steps:**

1. `workspace-deploy.md`-Delta:
   - `## MODIFIED Requirements` → `### Requirement: discover-versions.sh ermittelt
     Tool-Versionen ohne Flux` (exakter SSOT-Name, `workspace-deploy.md:677`): Body so
     ändern, dass ein optionaler `flux:`-Key **erlaubt** ist (kein Verbot mehr).
   - `## ADDED Requirements`:
     - Pull-based Reconciliation ist der Standard-Deploy-Pfad auf fleet.
     - `workspace:deploy` ist Break-Glass (deprecated, `flux suspend` zuerst).
     - Render-Vertrag: das OCI-Artefakt enthält keine Klartext-Secrets.
2. `ci-cd.md`-Delta:
   - `## MODIFIED Requirements` → `### Requirement: Dependency-Versions-Erkennung
     (discover-versions)` (exakter SSOT-Name, `ci-cd.md:1052`): `Flux SHALL NOT be
     tracked` umkehren.
   - `## ADDED Requirements`: CI rendert+pusht das OCI-Artefakt und pingt den
     Receiver statt `kubectl apply`.
3. Format: H2-Operationsheader, H3 `### Requirement:` (englisch, SHALL), jedes
   Requirement mit ≥1 `#### Scenario:` (GIVEN/WHEN/THEN) — sonst rot im Validator.
   MODIFIED-Namen müssen **exakt** dem SSOT-Namen entsprechen (Cross-Ref-Check).

**Acceptance:**
- `bash scripts/openspec.sh validate` meldet für `fluxcd-gitops` **keine** Errors
  (Warnungen wie fehlender `.ticket`-Link sind tolerierbar).
- Kein `### Requirement: TODO`/`#### Scenario: TODO`-Stub mehr in beiden Dateien.

---

### Task 10: Partial-Verifikation

**Ziel:** Die drei mandatorischen CI-Gates grün ziehen. (Der RED→GREEN
Failing-Test-Step ist **nicht** Teil dieses Partials — er lebt in p3-tests;
p1 liefert nur Infra + Specs.)

**Betroffene Dateien:** —

**Steps:**

```bash
task test:changed          # gezielte Tests der geänderten Domains
task freshness:regenerate  # generierte Artefakte aktualisieren
task freshness:check       # S1–S4-Ratchet + Baseline-Assertion + Freshness
```

Zusätzlich manifest-spezifisch:

```bash
task workspace:validate
bash scripts/openspec.sh validate
```

**Acceptance:**
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` laufen grün.
- `scripts/flux-render-artifact.sh` ≤ 500 Zeilen; `scripts/env-resolve.sh` ≤ 500 Zeilen.
- `bash scripts/openspec.sh validate` ohne Errors für `fluxcd-gitops`.
