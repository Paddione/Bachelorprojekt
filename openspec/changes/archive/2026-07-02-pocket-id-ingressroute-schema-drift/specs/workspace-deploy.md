## ADDED Requirements

### Requirement: Manifests SHALL only use fields declared in the installed CRD schema

The system SHALL NOT commit Kubernetes custom-resource manifests (e.g. Traefik
`IngressRoute`) that set fields not declared in the CRD schema actually installed on the
target cluster, since `task workspace:deploy` applies manifests via
`kubectl apply --server-side`, which validates every resource against the live CRD's
OpenAPI schema and aborts the entire apply chain on the first schema violation — blocking
deploy of every subsequent manifest in the same run, for both brands.

#### Scenario: pocket-id IngressRoute has no unsupported fields

- **GIVEN** the `fleet` cluster's installed `ingressroutes.traefik.io` CRD declares
  `spec` fields `entryPoints`, `parentRefs`, `routes`, `tls` only
- **WHEN** `kustomize build k3d/` renders the `pocket-id` `IngressRoute`
- **THEN** the rendered `spec` contains none of `forwardedHeaders` or any other field
  outside that declared set
- **AND** `task workspace:deploy ENV=<brand>`'s `kubectl apply --server-side` succeeds for
  the `pocket-id` `IngressRoute` and every manifest applied after it in the same run
