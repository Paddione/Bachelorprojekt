# flux-render-security

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu flux-render-security ergänzen._

## Requirements

### Requirement: Fail-Closed on Undefined Envsubst Variables

After substitution, the rendered output MUST be scanned for any remaining
`${VAR}` patterns. If any are found, the script MUST exit with status 1 and
list the undefined variables.

#### Scenario: Undefined variable causes build failure

```gherkin
GIVEN a kustomize overlay references ${UNDEFINED_VAR}
WHEN `scripts/flux-render-artifact.sh` runs
THEN the script exits with status 1
  AND the error message lists UNDEFINED_VAR as undefined
```

#### Scenario: All variables defined succeeds

```gherkin
GIVEN all referenced env vars are set in the environment
WHEN `scripts/flux-render-artifact.sh` runs
THEN the script exits with status 0
  AND the rendered output contains no literal ${VAR} patterns
```

<!-- merged from change delta flux-render-security.md (402efd65299c) -->

### Requirement: Immutable Image References in Rendered Prod Overlays

#### Change

Die Requirement gilt unverändert mit einer Präzisierung: Die Digest-Werte, die
der Caller des Renderers bereitstellt (z.B. `WEBSITE_IMAGE_DIGEST` aus
`render-fleet-artifact.yml`), MÜSSEN unverändert in das gerenderte Artefakt
gelangen. `scripts/env-resolve.sh` MUSS Caller-gesetzte Variablen respektieren
und sie nicht mit Werten aus `environments/*.yaml` überschreiben. Der in
`environments/fleet-*.yaml` committete Placeholder (`sha256:1111…` für Website,
`sha256:2222…` für Brett) darf ausschließlich als Offline-Fallback wirken, wenn
der Caller KEINEN Digest gesetzt hat — er darf nie ein Caller-gesetztes,
echtes Digest ersetzen.

#### Scenario: Caller-gesetzter Website-Digest überlebt die Environment-Auflösung

- **GIVEN** `WEBSITE_IMAGE_DIGEST` ist im Caller auf einen echten sha256-Digest gesetzt
- **WHEN** `scripts/env-resolve.sh fleet-mentolder` gesourct wird
- **THEN** bleibt `WEBSITE_IMAGE_DIGEST` auf dem Caller-Wert
- **AND** der committete Placeholder `sha256:1111…` ersetzt ihn nicht

#### Scenario: Caller-gesetzter Digest erreicht das gerenderte Artefakt

- **GIVEN** `WEBSITE_IMAGE_DIGEST` ist im Caller auf einen echten sha256-Digest gesetzt
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** referenziert das Website-Deployment unter `<dir>/website-mentolder`
  genau diesen Digest
- **AND** kein `sha256:1111…`-Placeholder kommt in einer Datei unter `<dir>` vor

### Requirement: Digest Resolution Is Fail-Closed Online

When the renderer runs with registry access, it MUST resolve the image digest from
the registry and MUST abort with a non-zero exit code if the lookup fails. It MUST
NOT silently substitute the committed offline fallback in response to a failed
lookup.

The committed fallback in `environments/fleet-*.yaml` applies only when the caller
explicitly signals offline operation. "Lookup failed" and "we are offline" are
distinct conditions and MUST be distinguished by an explicit signal rather than by
the exit code of the lookup.

#### Scenario: Registry lookup fails during a CI render

```gherkin
GIVEN the renderer runs with registry access requested
WHEN the digest lookup for the website image fails
THEN the renderer exits with a non-zero status
AND no artifact is pushed
```

#### Scenario: Offline render uses the committed fallback

```gherkin
GIVEN the renderer runs with the offline signal set and no registry credentials
WHEN `scripts/flux-render-artifact.sh --out <dir>` runs
THEN it renders successfully using WEBSITE_IMAGE_DIGEST and BRETT_IMAGE_DIGEST
     from environments/fleet-*.yaml
```

### Requirement: Every Artifact Push Carries an Immutable Revision Tag

Each push of the fleet manifests artifact MUST additionally tag the pushed revision
with an immutable, commit-derived tag (`sha-<commit-sha>`) alongside the movable
`latest` tag, so that a known-good revision can be selected by name through the
`OCIRepository` `spec.ref.tag` field.

#### Scenario: Artifact push tags the revision

```gherkin
GIVEN the render workflow has pushed the artifact to :latest
WHEN the push step completes
THEN the same revision is also reachable under the tag sha-<commit-sha>
```

<!-- merged from change delta flux-render-security.md (60931716bb6a) -->

### Requirement: Bootstrap Placeholders Must Be Covered by envsubst

Every `${VAR}` placeholder appearing in a file under `flux/clusters/fleet/bootstrap/` MUST be
passed to `envsubst` by the `flux:bootstrap` task that applies it. A placeholder without a
matching `envsubst` variable is applied to the cluster verbatim, producing a resource that exists
and reports healthy while matching nothing — the failure is invisible to `READY` conditions.

#### Scenario: Placeholder without envsubst coverage is rejected

- **GIVEN** a file under `flux/clusters/fleet/bootstrap/` contains a `${VAR}` placeholder
- **WHEN** `tests/spec/flux-render-security/bootstrap-envsubst.bats` runs
- **THEN** it passes only if `VAR` is listed in the `envsubst` invocation of the `flux:bootstrap` task
- **AND** on failure the output names the file and the uncovered variable

#### Scenario: Webhook IngressRoute resolves its host

- **GIVEN** `flux:bootstrap` has been applied for a brand
- **WHEN** the IngressRoute `flux-webhook` in `flux-system` is inspected
- **THEN** its host rule contains the resolved domain rather than a literal `${FLUX_WEBHOOK_HOST}`
- **AND** its TLS secret reference names an existing secret in `flux-system`

<!-- merged from change delta flux-render-security.md (4c8f8b9b0423) -->

### Requirement: Placeholder-Digests erreichen nie ein Artefakt (fail-closed)

Das gerenderte Artefakt MUSS frei von den bekannten Placeholder-Digests sein:
`sha256:1111111111111111111111111111111111111111111111111111111111111111`
(Website) und `sha256:2222222222222222222222222222222222222222222222222222222222222222`
(Brett). Findet der Renderer einen dieser Werte in seiner Ausgabe, MUSS er mit
Exit-Status 1 abbrechen und die Fundstellen nennen — unabhängig davon, ob der
Placeholder aus `environments/*.yaml` oder vom Caller stammt. Ein Artefakt mit
Placeholder-Digest pinnt ein nicht existierendes Image und versetzt jede Brand
in ImagePullBackOff.

#### Scenario: Placeholder-Digest in der Render-Ausgabe bricht den Render ab

- **GIVEN** `WEBSITE_IMAGE_DIGEST` trägt den Placeholder-Wert `sha256:1111…`
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** bricht das Skript mit Exit-Status 1 ab
- **AND** die Fehlermeldung nennt die Fundstelle des Placeholders

#### Scenario: Gesunder CI-Render läuft unverändert durch

- **GIVEN** der Caller setzt echte Digests für Website und Brett
- **WHEN** `scripts/flux-render-artifact.sh --out <dir>` läuft
- **THEN** endet das Skript mit Exit-Status 0
- **AND** die Ausgabe unter `<dir>` enthält keinen der beiden Placeholder-Digests

<!-- merged from change delta flux-render-security.md (e9091b0622bf) -->

### Requirement: OCIRepositories pin a deterministic sha revision

The Flux `OCIRepository` resources (`fleet-manifests`, `fleet-manifests-gitlab`) SHALL
reference an immutable `sha-<gitsha>` tag instead of the mutable `latest` tag. The
repository state MUST always name the exact artifact revision the cluster pulls, so a
rollback is a Git revert.

#### Scenario: No OCIRepository floats on latest

- **GIVEN** the files `flux/clusters/fleet/oci-source.yaml` and
  `flux/clusters/fleet/oci-source-gitlab.yaml`
- **WHEN** their `spec.ref` blocks are inspected
- **THEN** no `ref.tag` equals `latest`
- **AND** every `ref.tag` matches `sha-[0-9a-f]{7,40}`

#### Scenario: Rollback to a previous revision

- **GIVEN** the cluster runs revision `sha-aaa1111`
- **WHEN** an operator reverts the bump commit that pinned `sha-bbb2222`
- **THEN** Flux reconciles the cluster back to the artifact tagged `sha-aaa1111`

### Requirement: Render workflow advances the pin automatically

After a successful push and signature of a new fleet-manifests artifact on `main`, the
`render-fleet-artifact` workflow SHALL commit a bump that updates both OCIRepository
`ref.tag` values to `sha-${GITHUB_SHA}`. The bump commit MUST NOT trigger another
workflow run, and a failed bump push MUST NOT fail the workflow.

#### Scenario: Successful render bumps the pin without re-triggering

- **GIVEN** a push to `main` changed render inputs
- **WHEN** the workflow pushes, signs, and executes the bump step
- **THEN** a commit with `[skip ci]` sets both `ref.tag` values to `sha-${GITHUB_SHA}`
- **AND** no second workflow run is triggered by that commit

#### Scenario: Bump push race does not fail the render

- **GIVEN** another merge landed while the bump step was preparing its commit
- **WHEN** the bump push is rejected as non-fast-forward
- **THEN** the workflow logs a warning and completes successfully
- **AND** the next successful render retries the bump

<!-- merged from change delta flux-render-security.md (0104e087e18d) -->