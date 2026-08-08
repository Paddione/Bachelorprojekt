## ADDED Requirements

### Requirement: Rendered brand manifests name no decommissioned node

The test suite SHALL fail when a rendered brand overlay places a scheduling constraint on a node
hostname that the fleet cluster does not have.

The forbidden hostnames are those of the decommissioned standalone-cluster nodes: `k3s-1`,
`k3s-2`, `k3s-3`, `k3w-1`, `k3w-2` and `k3w-3`. The check applies to the built output of
`prod-fleet/mentolder` and `prod-fleet/korczewski`, not to the overlay sources, because a
constraint can be introduced at any layer of the wrapper chain and only the built result shows
what reaches the cluster.

Comment lines are out of scope: a comment explaining why a former constraint was removed is
documentation, not configuration.

The check SHALL verify that the build produced output before asserting the absence of the
hostnames, so that a failing `kustomize build` cannot be mistaken for a clean result.

#### Scenario: A clean brand build

- **GIVEN** the built output of a brand overlay names none of the six decommissioned hostnames
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A decommissioned node is reintroduced

- **GIVEN** an overlay adds a `nodeAffinity` term naming `k3s-1`
- **WHEN** the test suite runs
- **THEN** the check fails and names the offending hostname and the brand

#### Scenario: An empty build is not a pass

- **GIVEN** `kustomize build` fails or produces no output for a brand overlay
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting the absence of forbidden hostnames over empty
  input

### Requirement: No resource is rendered only to be deleted downstream

The test suite SHALL fail when a base overlay renders a resource that every one of its consuming
wrapper overlays removes.

The rule targets the specific waste this change removes: a resource produced by `prod-mentolder`
that no consumer lets through. Such a resource reaches no cluster, so its definition, its
`$patch: delete` counterpart and the reasoning connecting them are three places that must be kept
consistent for no effect.

The comparison set SHALL comprise **three** consumers, not only the brand wrapper:
`prod-fleet/mentolder`, `prod-fleet/mentolder-jobs` (which owns all Jobs since T002207) and
`prod-fleet/platform` (which owns the cluster singletons that `fleet-common` deletes from the
brand overlay). Omitting `prod-fleet/platform` makes the check report four legitimate resources —
`ClusterIssuer/letsencrypt-prod`, `IngressClass/traefik` and the `tls-sync`
`ClusterRole`/`ClusterRoleBinding` — as dead. A resource relocated to another Kustomization is not
waste; it is ownership moved.

The check SHALL compare the set of resource identities rendered by the base against the union of
those surviving in the three consumers, and SHALL verify both sets are non-empty before reporting
a difference.

#### Scenario: Every base resource survives somewhere

- **GIVEN** each resource rendered by `prod-mentolder` appears in the built output of at least one
  of the three consumers
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A cluster singleton relocated to platform is not waste

- **GIVEN** `fleet-common` deletes `IngressClass/traefik` from the brand overlay because
  `prod-fleet/platform` renders it
- **WHEN** the test suite runs
- **THEN** the check passes, because `prod-fleet/platform` is part of the comparison set

#### Scenario: A resource is deleted by every consumer

- **GIVEN** `prod-mentolder` renders a CronJob that both wrappers remove
- **WHEN** the test suite runs
- **THEN** the check fails and names the resource kind and name

#### Scenario: An empty comparison is not a pass

- **GIVEN** either the base build or the wrapper builds produce no resources
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting no difference over empty sets

### Requirement: The whisper deployment keeps its fleet placement

The rendered `whisper` Deployment in the mentolder brand SHALL carry a `nodeAffinity` requiring
one of the fleet control-plane hostnames `pk-hetzner-4`, `pk-hetzner-6` or `pk-hetzner-8`.

This requirement exists because the placement currently survives through a JSON6902 `op: replace`
whose target path is created by an unrelated patch. Removing that patch without rewriting the
override would drop the placement silently rather than loudly — the build would still succeed and
whisper would schedule anywhere. The requirement pins the outcome so that the rewrite is verified
by its result, not by inspection of the patch.

#### Scenario: Placement survives the patch rewrite

- **GIVEN** the mentolder overlay is built
- **WHEN** the `whisper` Deployment is inspected
- **THEN** it requires a hostname among `pk-hetzner-4`, `pk-hetzner-6`, `pk-hetzner-8`

#### Scenario: Placement lost

- **GIVEN** the whisper override is removed or its target path no longer resolves
- **WHEN** the test suite runs
- **THEN** the check fails, because the Deployment carries no such requirement
