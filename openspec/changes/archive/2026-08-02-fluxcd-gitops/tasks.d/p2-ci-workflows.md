# P2 — CI-Workflows (Push-Deploy → OCI-Artefakt-Render + Receiver-Ping)

Rolle: **impl / ci**. Partial P2 des Change `fluxcd-gitops` (T002083). Stellt die GitHub-Actions-
Deploy-Pfade von imperativem Push (`task workspace:deploy`, `kubectl set image`, `kubectl rollout
restart`, `kubectl apply` von SealedSecrets) auf **Render + OCI-Push + Receiver-Ping** um. Der
Cluster zieht danach seinen Soll-Zustand selbst (Flux), CI schreibt nur noch das gerenderte
Artefakt und stupst den Receiver an.

**Kern-Sicherheitsnetz — Feature-Flag `FLUX_ENABLED`:** Alle umgestellten Workflows lesen die
Repo-Variable `vars.FLUX_ENABLED`. Solange sie **nicht** `'true'` ist, läuft der **alte
Push-Pfad** unverändert weiter; erst wenn ein Operator sie nach dem P1-Bootstrap
(`task flux:bootstrap` + FluxInstance ready) auf `'true'` setzt, greift der neue Pfad. Damit ist
der P2-Code **jederzeit merge-sicher**, auch bevor Flux auf dem Cluster existiert (die
Bootstrap-Schritte aus P1 sind manuelle Cluster-Ops, kein Code-Merge).

## Disjunkter Scope (nur diese Dateien als Implementierungsziele)

| Datei | Aktion |
|-------|--------|
| `.github/workflows/render-fleet-artifact.yml` | **NEU** — reusable `workflow_call` + `push`-Trigger; render → `flux push artifact` → Receiver-Ping |
| `.github/workflows/post-merge.yml` | `deploy-manifests`-Job (Z58–109) auf render-artifact umstellen; imperative Post-Steps mit `FLEET_KUBECONFIG` als Übergang markiert bleiben |
| `.github/workflows/build-website.yml` | Overlay-Apply (Z167–190/313–336) + `kubectl set image` (Z193/339) durch `workflow_call` an render-fleet-artifact mit SHA-Tag-Input ersetzen |
| `.github/workflows/build-brett.yml` | `rollout restart` (Z87/111) durch Re-Render-Trigger mit SHA-Tag-Input ersetzen |
| `.github/workflows/deploy-sealed-secrets.yml` | **LÖSCHEN** — Flux reconciled den `sealed-secrets/`-Pfad des Artefakts |

## Abhängigkeiten zu P1 / P3 (bindend)

- **P1 (infra/render) liefert** — dieses Partial ruft sie nur auf, plant ihre Innereien NICHT:
  - `task flux:render` bzw. `scripts/flux-render-artifact.sh` — rendert alle Komponenten nach
    `out/` (inkl. `sealed-secrets/`, `clusters/fleet/`) über die bestehende
    `kustomize build | sed | envsubst | sed`-Pipeline. Nimmt Image-Tag-Overrides als Env-Vars
    entgegen (`WEBSITE_IMAGE_TAG`, `BRETT_IMAGE_TAG`).
  - Die **envsubst-Var-Einführung `BRETT_IMAGE`** im Brett-Overlay (heute `:latest` hart in
    `k3d/brett.yaml:34`). Ohne diese Var rendert P1 Brett weiter als `:latest` und ein Re-Render
    rollt den Pod **nicht** (unveränderter Digest). Die Zwischenlösung aus `design.md` (Z20/Z55):
    Build-Workflows übergeben ihr SHA-Tag; das Overlay pinnt darüber. **Das Overlay/Render gehört
    P1** — P2 übergibt nur den Input `brett_image_tag`. Siehe Task 2.4 (Acceptance nennt die
    Cross-Partial-Kopplung explizit).
  - `task flux:bootstrap` (Cluster-Op) + gesetzte Repo-Variable `FLUX_ENABLED=true` sind die
    **Aktivierungs-Voraussetzung**; ohne sie bleibt der Legacy-Pfad aktiv.
- **P3 (tests)** trägt die `expected: FAIL`-Failing-Tests (BATS gegen die Workflow-Struktur) —
  dieses Partial enthält **bewusst keinen** `expected: FAIL`-Step.

## S1-/S3-/S4-Notiz

- **S1:** Alle fünf Ziele sind YAML-Workflows bzw. eine Löschung — `.yml` ist im Quality-Ratchet
  **ungated** (kein Extension-Limit, siehe `intel.json.impact_files[*].s1_limit: 0` für die
  `.github/workflows/*.yml`-Einträge). Kein Zeilenbudget zu prüfen.
- **S3 (keine Brand-Domain-Literale):** Die Receiver-Webhook-URL wird **nicht** als
  `flux-webhook.<brand>.de`-Literal in ein Snippet geschrieben, sondern aus dem Secret
  `secrets.FLUX_WEBHOOK_URL` (bzw. `secrets.FLUX_WEBHOOK_TOKEN`) gelesen. `.github/workflows/`
  liegt zwar außerhalb des S3-Scans (`k3d/`, `prod*/`, `website/src/`), die Snippets halten die
  Regel dennoch ein.
- **S4:** Keine neuen `scripts/*.sh`/`*.mjs` in P2 (das Render-Skript ist P1). Der neue
  reusable Workflow ist von `post-merge.yml`/`build-website.yml`/`build-brett.yml` via `uses:`
  erreichbar → kein Orphan.

## Erforderliche Repo-Konfiguration (Secrets/Variablen, kein Code)

Diese Werte werden vom Operator im Repo hinterlegt (nicht Teil des Diffs, aber Acceptance-relevant):

- `vars.FLUX_ENABLED` — `'true'` aktiviert den neuen Pfad (Default: ungesetzt → Legacy).
- `secrets.FLUX_WEBHOOK_URL` — vollständige Receiver-URL (`https://flux-webhook.<domain>/hook/<pfad>`),
  aus `status.webhookPath` des P1-Receivers. Kein Domain-Literal im Code.
- `secrets.FLUX_WEBHOOK_TOKEN` — HMAC-Token des Receiver-`secretRef` (für den `X-Signature`-Header
  bzw. den generischen Token-Header, je nach P1-Receiver-`type`).
- Bestehend weiterverwendet: `secrets.GITHUB_TOKEN` (GHCR-Login/-Push, `packages: write`),
  `secrets.FLEET_KUBECONFIG` (nur noch imperative Post-Steps).

---

## File: `.github/workflows/render-fleet-artifact.yml` (NEU)

Reusable Workflow: rendert das Fleet-Manifest-Set, pusht es als OCI-Artefakt nach
`oci://ghcr.io/paddione/fleet-manifests:latest` und pingt den Flux-Receiver. Zwei Auslöser:
`workflow_call` (von Build-Workflows mit Image-Tag-Override) und `push` auf `main` bei
Manifest-/SealedSecret-Änderungen (ersetzt den bisherigen `post-merge`-Deploy für reine
Manifest-Diffs). GHCR-Login erfolgt via `GITHUB_TOKEN` (kein PAT) — `packages: write` genügt für
`ghcr.io/paddione/*`, wie `build-website.yml` bereits demonstriert.

### Task 2.1 — Reusable Workflow anlegen

**Ziel:** Eine wiederverwendbare, flag-gesteuerte Render+Push+Ping-Einheit, die sowohl von
`push`-Events als auch per `workflow_call` (mit optionalen Image-Tag-Inputs) läuft.

**Datei:** `.github/workflows/render-fleet-artifact.yml` (komplette Neuanlage).

**Steps:**

1. Trigger + Inputs + Permissions definieren:

```yaml
name: Render Fleet Artifact
on:
  workflow_call:
    inputs:
      website_image_tag:
        description: 'SHA-Tag für das Website-Image (leer = latest aus Overlay)'
        required: false
        type: string
        default: ''
      brett_image_tag:
        description: 'SHA-Tag für das Brett-Image (leer = latest aus Overlay)'
        required: false
        type: string
        default: ''
  push:
    branches: [main]
    paths:
      - 'k3d/**'
      - 'prod/**'
      - 'prod-fleet/**'
      - 'prod-mentolder/**'
      - 'prod-korczewski/**'
      - 'environments/sealed-secrets/**'
      - 'flux/clusters/**'

concurrency:
  group: render-fleet-artifact-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

env:
  OPENSPEC_TELEMETRY: '0'
```

2. Render-Job mit Flag-Guard. `if: vars.FLUX_ENABLED == 'true'` gilt **nur** für den
   `push`-Auslöser; bei `workflow_call` entscheidet der aufrufende Workflow über den Guard
   (er ruft diesen reusable Workflow nur im `FLUX_ENABLED`-Zweig auf). Damit ein direkter
   `push`-Lauf vor der Aktivierung nichts tut, steht der Guard am Job:

```yaml
jobs:
  render-push-ping:
    name: Render, push OCI artifact, ping receiver
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_call' || vars.FLUX_ENABLED == 'true'
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-tags: false

      - uses: arduino/setup-task@b91d5d2c96a56797b48ac1e0e89220bf64044611  # v2.0.0
        with:
          version: 3.x
          repo-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Install kustomize + flux CLI
        run: |
          rm -f /usr/local/bin/kustomize
          curl -sSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" \
            | bash -s -- 5.4.3 /usr/local/bin
          curl -sSL https://fluxcd.io/install.sh | sudo bash

      - name: Provide CI dummy secrets for render
        run: bash scripts/ci-dummy-secrets.sh

      - name: Render fleet manifests to out/
        env:
          WEBSITE_IMAGE_TAG: ${{ inputs.website_image_tag }}
          BRETT_IMAGE_TAG: ${{ inputs.brett_image_tag }}
        run: task flux:render
```

   **Begründung `ci-dummy-secrets.sh`:** `build-website.yml:43` nutzt es bereits, damit
   `freshness`/Render ohne echte Secrets läuft. Der Render-Vertrag (design.md Z54) garantiert,
   dass **keine** `secret: true`-Platzhalter in gerenderte Manifeste substituiert werden — die
   geheimen Werte stecken ausschließlich in den committeten SealedSecrets. P1s
   ENVSUBST_VARS-Audit ist die SSOT dieser Garantie; P2 verlässt sich darauf und substituiert
   nie selbst.

3. OCI-Push via `GITHUB_TOKEN` (kein PAT), danach Receiver-Ping. Secrets nie ins Log:

```yaml
      - name: Log in to GHCR
        uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9  # v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Push OCI artifact
        run: |
          set -euo pipefail
          flux push artifact \
            oci://ghcr.io/paddione/fleet-manifests:latest \
            --path=./out \
            --source="$(git config --get remote.origin.url)" \
            --revision="${GITHUB_REF_NAME}@sha1:${GITHUB_SHA}"

      - name: Ping Flux receiver (immediate reconcile)
        if: success()
        env:
          FLUX_WEBHOOK_URL: ${{ secrets.FLUX_WEBHOOK_URL }}
          FLUX_WEBHOOK_TOKEN: ${{ secrets.FLUX_WEBHOOK_TOKEN }}
        run: |
          set -euo pipefail
          if [[ -z "${FLUX_WEBHOOK_URL:-}" ]]; then
            echo "FLUX_WEBHOOK_URL not configured — skipping receiver ping (Flux will pick up on its 10m interval)."
            exit 0
          fi
          # HMAC-SHA256 des Payloads mit dem Receiver-Token (generic-hmac).
          payload='{}'
          sig="sha256=$(printf '%s' "$payload" \
            | openssl dgst -sha256 -hmac "$FLUX_WEBHOOK_TOKEN" -hex | awk '{print $2}')"
          # --fail: HTTP-Fehler → non-zero; kein -v/-i, damit keine Header/Token geloggt werden.
          curl --fail --show-error --silent \
            -X POST "$FLUX_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -H "X-Signature: $sig" \
            --data "$payload" \
            || { echo "Receiver ping failed (non-fatal) — Flux reconciles on its interval."; exit 0; }
```

   **Secret-Hygiene:** `curl` läuft ohne `-v`/`-i`; der HMAC wird lokal berechnet, nie das
   Roh-Token übertragen. Der Ping ist **non-fatal** (Failsafe-Polling `interval: 10m` aus P1
   fängt einen verpassten Ping auf), damit ein Receiver-Ausfall den Push nicht rot färbt.

**Acceptance:**
- `flux push artifact` referenziert `oci://ghcr.io/paddione/fleet-manifests:latest`, Login via
  `GITHUB_TOKEN`, kein `GH_PAT`.
- Der Job no-opt bei direktem `push`, solange `vars.FLUX_ENABLED != 'true'`; bei `workflow_call`
  läuft er immer (Guard liegt beim Aufrufer).
- Kein Secret erscheint im Log (kein `-v`/`echo` von Token/URL-Query); Ping non-fatal.
- Image-Tag-Inputs werden als `WEBSITE_IMAGE_TAG`/`BRETT_IMAGE_TAG` an `task flux:render`
  durchgereicht.
- `yamllint`/`actionlint` (via `task test:all`) akzeptiert die Datei; `workflow_call`-Inputs sind
  typisiert.

---

## File: `.github/workflows/post-merge.yml`

Der `deploy-manifests`-Job (Z58–109) führt heute `task workspace:deploy ENV=mentolder|korczewski`
gegen `FLEET_KUBECONFIG` aus. Er wird durch einen flag-gesteuerten Aufruf des reusable
render-fleet-artifact-Workflows ersetzt. `mark-awaiting` (Z17–56), `Mark ticket done` (Z111–146)
und `Scout drift ratchet` (Z147–176) bleiben unverändert erhalten — sie tracken Ticket-Status/Drift
und sind vom Deploy-Mechanismus unabhängig (Merge = Abschluss, Prod-Deploy entkoppelt).

### Task 2.2 — `deploy-manifests` auf render-artifact umstellen (mit Legacy-Fallback)

**Ziel:** Bei `FLUX_ENABLED=true` rendert+pusht CI das Artefakt statt zu pushen; sonst läuft der
bisherige `task workspace:deploy`-Pfad unverändert weiter. Die imperativen Post-Steps
(`website:migrate`, `talk-setup`, `sync-db-passwords`) bleiben mit `FLEET_KUBECONFIG` als
**Übergangs-Schritt** und werden klar markiert.

**Anker:** kompletter `deploy-manifests`-Job Z58–109.

**Schritte:**

1. Neuen Detect-Job vorschalten bleibt: die Manifest-Erkennung (`scripts/changed-manifests.sh`)
   ist weiter nötig, damit der Legacy-Zweig nur bei Manifest-Diffs deployt. Detect als eigenen
   Job extrahieren, damit beide Zweige (`needs: [mark-awaiting, detect]`) ihn nutzen:

```yaml
  detect:
    name: Detect manifest changes
    runs-on: ubuntu-latest
    needs: mark-awaiting
    outputs:
      manifests_changed: ${{ steps.detect.outputs.manifests_changed }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
          fetch-tags: false
      - id: detect
        run: |
          if bash scripts/changed-manifests.sh HEAD~1 HEAD; then
            echo "manifests_changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "manifests_changed=false" >> "$GITHUB_OUTPUT"
          fi
```

2. **Neuer Pfad** (Flag an): reusable Workflow als Job aufrufen. Ein `workflow_call`-Job braucht
   `secrets: inherit`, damit der Render-Workflow an `GITHUB_TOKEN`/`FLUX_WEBHOOK_*` kommt:

```yaml
  render-artifact:
    name: Render fleet artifact (GitOps)
    needs: [mark-awaiting, detect]
    if: vars.FLUX_ENABLED == 'true' && needs.detect.outputs.manifests_changed == 'true'
    uses: ./.github/workflows/render-fleet-artifact.yml
    secrets: inherit
```

3. **Legacy-Pfad** (Flag aus): der bisherige Push-Deploy, jetzt hinter dem Flag-Negativ und mit
   `needs.detect`. Job umbenennen zu `deploy-legacy`, Schritte 1:1 aus Z78–109 übernehmen, nur die
   `if:`-Bedingungen erweitern:

```yaml
  deploy-legacy:
    name: Deploy manifests (legacy push, pre-Flux)
    runs-on: ubuntu-latest
    needs: [mark-awaiting, detect]
    if: vars.FLUX_ENABLED != 'true' && needs.detect.outputs.manifests_changed == 'true'
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 2
          fetch-tags: false
      - name: Install kubectl and kustomize
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          rm -f /usr/local/bin/kustomize
          curl -sSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" \
            | bash -s -- 5.4.3 /usr/local/bin
      - uses: arduino/setup-task@b91d5d2c96a56797b48ac1e0e89220bf64044611  # v2.0.0
        with:
          version: 3.x
          repo-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Set up kubeconfig
        env:
          FLEET_KUBECONFIG: ${{ secrets.FLEET_KUBECONFIG }}
        run: |
          mkdir -p "$HOME/.kube"
          echo "$FLEET_KUBECONFIG" | base64 -d > "$HOME/.kube/config"
          chmod 600 "$HOME/.kube/config"
          echo "KUBECONFIG=$HOME/.kube/config" >> "$GITHUB_ENV"
      - name: Deploy workspace to mentolder
        run: task workspace:deploy ENV=mentolder
      - name: Deploy workspace to korczewski
        run: task workspace:deploy ENV=korczewski
```

4. **Imperative Post-Steps als Übergangs-Job.** `website:migrate` (DB-Migration) und `talk-setup`
   bleiben laut `design.md` (Sonderfälle-Tabelle) in Stufe 1 imperativ mit `FLEET_KUBECONFIG`.
   Sie müssen in **beiden** Zweigen laufen (auch im GitOps-Pfad, weil Flux sie nicht abdeckt).
   Als eigenen Job mit `needs` auf beide Deploy-Zweige und `if: always()` + Erfolgsprüfung
   modellieren, klar als Übergang kommentiert:

```yaml
  post-deploy-imperative:
    name: Imperative post-steps (TRANSITIONAL — removed once migrations are k8s Jobs)
    runs-on: ubuntu-latest
    needs: [render-artifact, deploy-legacy]
    # Läuft, sobald einer der Deploy-Zweige nicht fehlgeschlagen ist. FLEET_KUBECONFIG
    # bleibt in Stufe 1 NUR für diese imperativen Schritte (design.md Follow-up:
    # website:migrate als k8s-Job → dann kompletter FLEET_KUBECONFIG-Rückbau).
    if: |
      always() &&
      needs.render-artifact.result != 'failure' &&
      needs.deploy-legacy.result != 'failure'
    steps:
      - uses: actions/checkout@v7
        with: { fetch-tags: false }
      - uses: arduino/setup-task@b91d5d2c96a56797b48ac1e0e89220bf64044611  # v2.0.0
        with:
          version: 3.x
          repo-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Set up kubeconfig
        env:
          FLEET_KUBECONFIG: ${{ secrets.FLEET_KUBECONFIG }}
        run: |
          mkdir -p "$HOME/.kube"
          echo "$FLEET_KUBECONFIG" | base64 -d > "$HOME/.kube/config"
          chmod 600 "$HOME/.kube/config"
          echo "KUBECONFIG=$HOME/.kube/config" >> "$GITHUB_ENV"
      - name: Run transitional imperative post-steps
        run: |
          # In Stufe 1 unverändert imperativ (design.md Sonderfälle-Tabelle).
          task website:migrate ENV=mentolder
          task website:migrate ENV=korczewski
```

   > **Hinweis:** Die konkrete Task-Liste (`website:migrate`, ggf. `talk-setup`,
   > `sync-db-passwords`) übernimmt der Implementierer 1:1 aus dem heutigen
   > `workspace:deploy`-Post-Block (`Taskfile.yml:2853-2879`, in `intel.json.symbols`
   > referenziert). Es werden **keine neuen** imperativen Schritte eingeführt.

5. **`Mark ticket done`/`Scout drift ratchet` anpassen:** ihr `needs:` von `deploy-manifests` auf
   `[render-artifact, deploy-legacy, post-deploy-imperative]` umhängen und die `if:`-Erfolgsprüfung
   auf `if: !failure() && !cancelled()` umstellen (statt `if: success()`), damit die
   Ticket-Schließung in beiden Flag-Zuständen greift. Der Body dieser Steps bleibt sonst
   unverändert.

**Acceptance:**
- Bei `FLUX_ENABLED != 'true'` ist das Verhalten **byte-nah identisch** zum Ist (gleiche
  `workspace:deploy`-Aufrufe, gleiche Ticket-Transitions).
- Bei `FLUX_ENABLED == 'true'` läuft kein `kubectl apply`/`workspace:deploy` mehr für Manifeste;
  stattdessen `render-artifact` (reusable) + die imperativen Post-Steps.
- `FLEET_KUBECONFIG` wird im GitOps-Pfad **nur** noch vom `post-deploy-imperative`-Job und den
  Ticket-Status-Steps benutzt; der Übergangscharakter ist im Job-Namen/Kommentar dokumentiert.
- Ticket-Schließung + Scout-Drift laufen in beiden Zweigen.

---

## File: `.github/workflows/build-website.yml`

Beide Deploy-Jobs (`deploy-mentolder` Z81–226, `deploy-korczewski` Z228–372) rendern heute das
Website-Overlay und pinnen per `kubectl set image` das frisch gebaute SHA-Image. Im GitOps-Pfad
übernimmt das der Artefakt-Re-Render mit SHA-Tag-Input; die Legacy-Schritte bleiben hinter dem Flag.

### Task 2.3 — Website-Deploy auf render-artifact-`workflow_call` umstellen

**Ziel:** Statt `kubectl apply` + `kubectl set image` triggert der Build bei `FLUX_ENABLED=true`
den reusable Render-Workflow mit `website_image_tag=<SHA_TAG>`; Flux rollt daraufhin die neue
Website-Revision aus. Der `build-image`-Job (Z15–79) bleibt unverändert (baut + pusht das Image
weiterhin mit SHA- und `:latest`-Tag).

**Anker:** die beiden Deploy-Jobs. Umbau in drei Teile:

1. **Neuer GitOps-Job** (ein einziger Aufruf genügt — der Re-Render deckt beide Brands ab, weil
   `flux:render` alle Website-Overlays rendert):

```yaml
  render-artifact:
    name: Re-render fleet artifact (pins website SHA)
    needs: [build-image]
    if: vars.FLUX_ENABLED == 'true'
    uses: ./.github/workflows/render-fleet-artifact.yml
    with:
      website_image_tag: ${{ needs.build-image.outputs.sha_tag }}
    secrets: inherit
```

2. **Legacy-Jobs beibehalten, hinter dem Flag.** `deploy-mentolder`/`deploy-korczewski` bekommen
   je `if: vars.FLUX_ENABLED != 'true'` am Job (die restlichen env-Blöcke/Steps bleiben exakt wie
   Ist — das ist der belassene Push-Pfad):

```yaml
  deploy-mentolder:
    name: Deploy Website (mentolder)
    runs-on: ubuntu-latest
    needs: [build-image]
    if: vars.FLUX_ENABLED != 'true'
    permissions:
      contents: read
    # ... unveränderter env-Block + Steps aus dem Ist (Z88–226) ...
```

   (analog `deploy-korczewski` mit demselben `if:`).

3. **Rollout-Verifikation im GitOps-Pfad:** Der Legacy-Pfad hatte `Wait for rollout` +
   `Pre-Rollout Secret-Check`. Im GitOps-Pfad übernimmt Flux das Rollout (`wait: true` in der
   P1-Kustomization); ein zusätzlicher Verifikations-Job entfällt in Stufe 1 bewusst (Flux-Ready-
   Condition ist die SSOT — vgl. design.md „Beobachtbarkeit"). Kein neuer `FLEET_KUBECONFIG`-Zugriff.

**Acceptance:**
- Bei `FLUX_ENABLED == 'true'` kein `kubectl set image`/`kubectl apply` mehr; das SHA-Tag fließt
  ausschließlich als `website_image_tag`-Input in den Re-Render.
- Bei `FLUX_ENABLED != 'true'` sind `deploy-mentolder`/`deploy-korczewski` unverändert
  funktionsfähig (inkl. Secret-Check + `rollout status`).
- Das Website-Image trägt weiterhin sowohl SHA- als auch `:latest`-Tag (build-image-Job unberührt).
- Keine Brand-Domain-Literale in neuen Snippets (die bestehenden env-Literale im Legacy-Block
  bleiben unberührt — kein neuer S3-Verstoß eingeführt).

---

## File: `.github/workflows/build-brett.yml`

Beide Deploy-Jobs führen `kubectl rollout restart deployment/brett` (Z87/111) aus, weil Brett
`:latest` nutzt (`k3d/brett.yaml:34`) und ein reiner Re-Deploy sonst kein neues Image zieht. Im
GitOps-Pfad wird der Restart durch einen Re-Render mit **SHA-getaggtem** Brett-Image ersetzt.

### Task 2.4 — Brett-Deploy auf Re-Render-Trigger umstellen (SHA-Tag-Kopplung)

**Ziel:** Bei `FLUX_ENABLED=true` triggert der Build den reusable Render-Workflow mit
`brett_image_tag=sha-<sha>`; Flux rollt die neue Brett-Revision aus. Der `build`-Job (Z12–64)
bleibt unverändert und pusht weiterhin `sha-<sha>` **und** `:latest`.

**Cross-Partial-Kopplung (bindend):** Damit ein Re-Render den Brett-Pod tatsächlich rollt, muss das
Brett-Overlay das Image über eine envsubst-Var (`${BRETT_IMAGE}` o.ä.) statt hart `:latest`
beziehen — **das ist P1s Render-/Overlay-Aufgabe** (siehe „Abhängigkeiten zu P1"). P2 liefert nur
das SHA-Tag als Input. Fehlt die P1-Var, rendert Brett weiter `:latest` und der Re-Render ist ein
No-Op fürs Rollout (dokumentiertes Design-Risiko, `design.md` Z20). Der Legacy-Pfad
(`rollout restart`) bleibt als Fallback erhalten, solange `FLUX_ENABLED != 'true'`.

**Anker:** `deploy-mentolder` (Z66–88) und `deploy-korczewski` (Z90–112).

**Schritte:**

1. GitOps-Job (ein Aufruf, deckt beide Brands ab):

```yaml
  render-artifact:
    name: Re-render fleet artifact (pins brett SHA)
    needs: [build]
    if: vars.FLUX_ENABLED == 'true'
    uses: ./.github/workflows/render-fleet-artifact.yml
    with:
      brett_image_tag: sha-${{ needs.build.outputs.sha_tag }}
    secrets: inherit
```

2. Legacy-Jobs hinter dem Flag belassen — je `if: vars.FLUX_ENABLED != 'true'` an
   `deploy-mentolder`/`deploy-korczewski`; ihre `rollout restart`/`rollout status`-Steps bleiben
   1:1 (Fallback-Pfad).

**Acceptance:**
- Bei `FLUX_ENABLED == 'true'` kein `kubectl rollout restart` mehr; das SHA-Tag fließt als
  `brett_image_tag`-Input in den Re-Render.
- Bei `FLUX_ENABLED != 'true'` sind beide Legacy-Deploy-Jobs unverändert funktionsfähig.
- Der Plan benennt die P1-Overlay-Var-Abhängigkeit explizit; ohne sie ist der GitOps-Brett-Rollout
  ein bekannter No-Op (kein stiller Fehler).

---

## File: `.github/workflows/deploy-sealed-secrets.yml` (LÖSCHEN)

### Task 2.5 — Dedizierten SealedSecret-Deploy-Workflow entfernen

**Ziel:** Die Datei `.github/workflows/deploy-sealed-secrets.yml` wird gelöscht. Grund: Flux
reconciled den `sealed-secrets/`-Pfad des OCI-Artefakts (P1: Kustomization `flux-sealed-secrets`,
`prune: false`). Der render-fleet-artifact-Workflow triggert bereits auf
`environments/sealed-secrets/**` (Task 2.1, `push`-`paths`), rendert die committeten
`fleet-*.yaml` mit ins Artefakt und pingt den Receiver → der SealedSecrets-Controller entschlüsselt
sie im Cluster. Der separate, `FLEET_KUBECONFIG`-gestützte Apply-Workflow ist damit redundant.

**Schritte:**

1. `git rm .github/workflows/deploy-sealed-secrets.yml`.
2. In `render-fleet-artifact.yml` verifizieren, dass `environments/sealed-secrets/**` in den
   `push`-`paths` steht (ist in Task 2.1 enthalten) — das ersetzt den bisherigen Path-Trigger des
   gelöschten Workflows.

**Cutover-Ordnungs-Constraint (bindend, sonst Deploy-Lücke):** Der dedizierte Workflow ist das
heutige einzige Auto-Deploy für SealedSecret-Rotationen. Nach seiner Löschung übernimmt der
render-fleet-artifact-Pfad diese Aufgabe **nur bei `FLUX_ENABLED == 'true'`**. Zwischen Merge und
Flag-Aktivierung gibt es daher ein Fenster ohne SealedSecret-Auto-Deploy. Deshalb gilt:

- Die P1-Bootstrap-Reihenfolge (Flux installiert, FluxInstance ready, erstes Artefakt gepusht)
  MUSS abgeschlossen und `FLUX_ENABLED=true` gesetzt sein, **bevor** in diesem Fenster eine
  SealedSecret-Rotation ansteht.
- Übergangs-Break-Glass für eine dringende Rotation im Fenster: `kubectl apply -f
  environments/sealed-secrets/fleet-<brand>.yaml` gegen `FLEET_KUBECONFIG` (manuell, dokumentiert)
  — identisch zu dem, was der gelöschte Workflow tat.

Dieser Constraint gehört in die Change-`README`/`design.md`-Betriebsnotiz und in den
Reviewer-Merge-Checkpoint; er wird als **offenes Risiko** an den Orchestrator zurückgemeldet.

**Acceptance:**
- `.github/workflows/deploy-sealed-secrets.yml` existiert nach der Änderung nicht mehr.
- `render-fleet-artifact.yml` deckt `environments/sealed-secrets/**` als Trigger ab.
- Kein anderer Workflow referenziert die gelöschte Datei (grep-frei nach Löschung).

---

## Reihenfolge & Merge-Sicherheit (Zusammenfassung für den Orchestrator)

1. **P1 zuerst wirksam:** Flux muss auf fleet gebootstrapped sein (`task flux:bootstrap`,
   FluxInstance ready, erstes Artefakt vorhanden), **bevor** `FLUX_ENABLED=true` gesetzt wird.
2. **P2-Code ist merge-sicher ohne P1-Bootstrap:** Solange `FLUX_ENABLED` ungesetzt ist, läuft der
   komplette alte Push-Pfad (post-merge, build-website, build-brett) unverändert. Einzige
   Ausnahme: der gelöschte `deploy-sealed-secrets.yml` (siehe Cutover-Constraint).
3. **Aktivierung = ein Schalter:** Operator setzt `vars.FLUX_ENABLED=true` + hinterlegt
   `FLUX_WEBHOOK_URL`/`FLUX_WEBHOOK_TOKEN`. Ab dann GitOps.
4. **Rückrollen:** `FLUX_ENABLED` löschen → sofort zurück auf Push-Pfad (Legacy-Jobs sind erhalten,
   nicht gelöscht). Break-Glass zusätzlich: `task workspace:deploy` (design.md).
