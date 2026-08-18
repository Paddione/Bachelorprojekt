---
title: "gitlab-registry-mirror — Implementation Plan"
ticket_id: T012415
domains: [ci-cd, fleet-operations]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gitlab-registry-mirror — Implementation Plan

_Ticket: T012415_

## File Structure

```
.github/workflows/build-brett.yml              (M, 129 Z)  Dual-Push-Tags + GitLab-Login
.github/workflows/build-collabora.yml          (M)         dito
.github/workflows/build-docs.yml               (M, 128 Z)  dito
.github/workflows/build-mediaviewer-widget.yml (M)         dito
.github/workflows/build-mentolder-web.yml      (M)         dito
.github/workflows/build-rustdesk-installer.yml (M)         dito
.github/workflows/build-sdlc-console.yml       (M)         dito
.github/workflows/build-transcriber.yml        (M)         dito
.github/workflows/build-videovault.yml         (M)         dito
.github/workflows/build-website.yml            (M, 438 Z)  dito
.github/workflows/render-fleet-artifact.yml    (M, 163 Z)  cosign-copy-Schritt nach dem Signieren
flux/clusters/fleet/oci-source-gitlab.yaml     (N)         zweite OCIRepository, suspend: true
environments/sealed-secrets/mentolder.yaml     (M)         gitlab-registry-auth ergaenzt
docs/runbooks/gitlab-runner.md                 (M, 571 Z)  §16 Registry-Failover, beide Richtungen
tests/spec/ci-cd/gitlab-registry-mirror.bats   (N)         Guards zu allen drei Requirements
```

## Partials

| # | Rolle | target_files |
|---|---|---|
| P1 | Build-Workflows | die zehn `.github/workflows/build-*.yml` |
| P2 | Artefakt + Cluster-Quelle | `.github/workflows/render-fleet-artifact.yml`, `flux/clusters/fleet/oci-source-gitlab.yaml`, `environments/sealed-secrets/mentolder.yaml` |
| P3 | Tests + Runbook | `tests/spec/ci-cd/gitlab-registry-mirror.bats`, `docs/runbooks/gitlab-runner.md` |

Die Partials sind dateidisjunkt. P3 traegt den RED-Schritt und laeuft zuletzt.

## Vorbedingung (einmalig, vor P1)

- [ ] **GitLab-Token bereitstellen.** (OFFEN — Operator-Aktion, siehe Runbook 16.2.) Project-Access-Token mit Scope
      `write_registry` erzeugen und als GitHub-Secret `GITLAB_REGISTRY_TOKEN`
      hinterlegen — **getrennt** von `GITLAB_MIRROR_TOKEN` (D4).

      Achtung: `gh secret set` schreibt ohne TTY einen leeren Wert, und ein
      frischer Zeitstempel belegt nicht, dass etwas drinsteht. Wert per
      Datei-Umleitung setzen und danach einen Workflow-Lauf pruefen, nicht die
      Secret-Liste.

## P1 — Spiegel-Schritt in den Build-Workflows

> **Korrektur waehrend der Umsetzung.** Der Plan sah zunaechst vor, die
> GitLab-Tags in die `tags:`-Liste des Build-Schritts aufzunehmen. Das ist
> falsch: Die Tag-Liste ist atomar — ein GitLab-Ausfall oder ein fehlendes Token
> haette damit den **primaeren** ghcr-Push umgerissen, und ohne gesetztes Secret
> waeren alle neun Build-Workflows sofort rot gewesen. Die Redundanz haette die
> Verfuegbarkeit gesenkt statt sie zu erhoehen. Umgesetzt ist deshalb ein
> separater, nicht-blockierender Schritt.

- [x] **Zentrales Spiegel-Skript.** `scripts/mirror-image-to-gitlab.sh` kopiert
      die uebergebenen ghcr-Tags per `docker buildx imagetools create`
      (serverseitig, kein Rebuild, gleicher Digest). Ohne
      `GITLAB_REGISTRY_PREFIX`/`GITLAB_REGISTRY_TOKEN` endet es mit Exit 0 und
      einer SKIP-Meldung.

- [x] **Spiegel-Schritt in den neun bauenden Workflows.** Jeweils nach dem
      `docker/build-push-action`-Schritt, mit `continue-on-error: true` und der
      wortgleich uebernommenen Tag-Liste als `SOURCE_TAGS`. Wo der Build-Schritt
      ein bedingtes `push:` traegt, uebernimmt der Spiegel-Schritt dieselbe
      Bedingung — sonst wuerde er bei PR-Laeufen ein Image spiegeln wollen, das
      nie gepusht wurde.

- [x] **`renovate.yml` nicht angefasst.** Der Workflow referenziert ein
      Fremd-Image (`ghcr.io/renovatebot/renovate`), das wir nicht bauen und
      folglich nicht spiegeln. `build-rustdesk-installer.yml` faellt aus
      demselben Grund heraus: es nutzt kein `docker/build-push-action`.

## P2 — Artefakt-Spiegel und Cluster-Quelle

- [x] **`cosign copy` nach dem Signieren.** In `render-fleet-artifact.yml` nach
      dem Schritt `Sign OCI artifact (cosign keyless)` einen Spiegel-Schritt
      ergaenzen:

```bash
cosign copy --force \
  "ghcr.io/paddione/fleet-manifests@${DIGEST}" \
  "registry.gitlab.com/<ns>/<projekt>/fleet-manifests:latest"
```

      **Nicht `crane copy`.** Die Signatur liegt als eigenes Tag
      (`sha256-<digest>.sig`) neben dem Artefakt; `crane copy` auf den
      Artefakt-Tag laesst sie zurueck. Der Spiegel waere unsigniert, und das
      faellt erst im Ausfall auf, wenn Flux ihn ablehnt (D2).

- [x] **Zweite OCIRepository anlegen.** `flux/clusters/fleet/oci-source-gitlab.yaml`
      als Kopie von `oci-source.yaml` mit `suspend: true`, GitLab-URL und
      `secretRef: gitlab-registry-auth`. Der `verify`-Block wird **wortgleich**
      uebernommen — dieselbe Issuer- und Subject-Regex. Das ist der Punkt, an
      dem der Spiegel seinen Wert beweist: dieselbe Policy akzeptiert ihn, weil
      die Signatur am Digest haengt (D1).

- [ ] **Pull-Secret sealen.** (OFFEN — braucht ein echtes Deploy-Token vom Operator.) Deploy-Token mit `read_registry` als
      `gitlab-registry-auth` nach dem Muster von `ghcr-auth` sealen
      (`task env:seal ENV=mentolder`). Kein Deployment referenziert es, solange
      nicht umgeschaltet wird.

## P3 — Guards und Runbook (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/ci-cd/gitlab-registry-mirror.bats`
      anlegen, mit je einem Test pro Requirement: (a) jeder `build-*.yml`, der
      nach `ghcr.io` pusht, traegt auch eine `registry.gitlab.com`-Tag-Zeile;
      (b) `render-fleet-artifact.yml` enthaelt `cosign copy` und **kein**
      `crane copy`, und der Copy-Schritt steht nach `cosign sign`;
      (c) `oci-source.yaml` nennt weiterhin genau einen Issuer, und
      `oci-source-gitlab.yaml` traegt `suspend: true`.

      Jeder Negativtest bekommt einen Positiv-Anker (Repo-Konvention
      `tests/CLAUDE.md`), damit ein leerer Treffer nicht als Erfolg zaehlt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/gitlab-registry-mirror.bats
# expected: FAIL (rot — Dual-Push, cosign copy und die zweite Quelle fehlen noch)
```

- [x] **Runbook-Abschnitt (GREEN).** `docs/runbooks/gitlab-runner.md` um §16
      "Registry-Failover" ergaenzen: Umschalten (`fleet-manifests-gitlab`
      entsuspendieren, `sourceRef` der Kustomizations umhaengen),
      **Zuruecknehmen** als gleichwertiger Schritt, und der ausdrueckliche
      Hinweis, dass waehrend eines GitHub-Ausfalls **keine neuen** Artefakte
      entstehen — der Spiegel traegt Rollout und Rollback bereits gebauter
      Staende, nicht mehr (D1).

- [x] **Test gruen.** Derselbe BATS-Lauf wie oben muss nun bestehen.

## Final Verification

- [ ] **Alle drei Pflicht-Gates laufen lassen.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
