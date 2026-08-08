## ADDED Requirements

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
