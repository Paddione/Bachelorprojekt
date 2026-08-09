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

The rendered artifact tree MUST reference the website and brett images by digest
(`image@sha256:…`) in every `prod-fleet` component. A movable tag such as `:latest`
MUST NOT appear as the image reference for these images in the rendered prod output.

The `k3d/` base keeps its tag-based reference — dev and k3d deliberately track a
movable tag.

#### Scenario: Rendered prod overlay pins by digest

```gherkin
GIVEN WEBSITE_IMAGE_DIGEST and BRETT_IMAGE_DIGEST are set to valid sha256 digests
WHEN `scripts/flux-render-artifact.sh --out <dir>` runs
THEN every website image reference under <dir>/website-mentolder, <dir>/website-korczewski,
     <dir>/mentolder and <dir>/korczewski contains "@sha256:"
AND no website or workspace-brett image reference in those trees ends in ":latest"
```

#### Scenario: Brett digest reaches the rendered manifest

```gherkin
GIVEN BRETT_IMAGE_DIGEST is set to a valid sha256 digest
WHEN `scripts/flux-render-artifact.sh --out <dir>` runs
THEN the rendered brett Deployment references that exact digest
```

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