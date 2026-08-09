## ADDED Requirements

### Requirement: Kubelet serving certificate drift detection on the local k3d dev cluster

The system SHALL provide a read-only check that compares, for every node of the
local k3d dev cluster, the node's Kubernetes `InternalIP` against the IP entries
in the Subject Alternative Name of that node's kubelet serving certificate, and
SHALL report a mismatch as an actionable finding naming the node, both IPs and
the repair command.

The check SHALL distinguish a finding from a missing precondition by exit code:
`0` when every node matches, `1` when at least one node's certificate is stale,
and `2` when a required tool (`kubectl`, `docker`, `openssl`) is unavailable or
the cluster context cannot be reached.

The certificate SHALL be parsed on the host, because the k3s node container does
not ship an `openssl` binary.

#### Scenario: Node IP matches the certificate SAN

- **GIVEN** the node's `InternalIP` is contained in the certificate's SAN IP list
- **WHEN** the check runs
- **THEN** it exits `0` and reports the node as OK

#### Scenario: Docker IPs swapped and the certificate SAN is stale

- **GIVEN** the node's `InternalIP` is NOT contained in the certificate's SAN IP list
- **WHEN** the check runs
- **THEN** it exits `1`
- **AND** the output names the node, the current node IP, the SAN IP and the repair command

#### Scenario: Required tooling is unavailable

- **GIVEN** `openssl` is not present in `PATH`
- **WHEN** the check runs
- **THEN** it exits `2` rather than `1`, so a missing precondition is not reported as a finding

### Requirement: Repairing a stale kubelet serving certificate

The system SHALL offer a `--repair` mode that deletes the kubelet serving
certificate and key inside the affected node container, restarts that container,
and re-runs the check afterwards.

Repair SHALL NOT be triggered implicitly by any other command. Restarting a node
container as a side effect of an unrelated operation would disrupt every
concurrent session.

#### Scenario: Restart alone does not reissue the certificate

- **GIVEN** a node whose kubelet serving certificate carries a stale SAN
- **WHEN** the node container is restarted WITHOUT deleting the certificate files
- **THEN** the SAN remains stale and the check still exits `1`

#### Scenario: Deleting the certificate before the restart reissues it

- **GIVEN** a node whose kubelet serving certificate carries a stale SAN
- **WHEN** the repair mode deletes certificate and key and then restarts the container
- **THEN** the reissued certificate contains the node's current IP and the check exits `0`

### Requirement: Translating the misleading x509 error in the ticket tooling

The shared exec path used by the ticket tooling SHALL detect an x509 SAN
verification failure in the error output of `kubectl exec` and SHALL emit an
additional hint that names the kubelet as the affected component and states the
check command. The hint SHALL remain silent for unrelated errors.

The raw error names `psql` and the `shared-db` pod and therefore points at the
database rather than at the kubelet; without the hint the reader searches in the
wrong subsystem.

#### Scenario: x509 SAN failure is translated

- **GIVEN** `kubectl exec` fails with `tls: failed to verify certificate: x509: certificate is valid for …, not <node-ip>`
- **WHEN** the shared exec path handles the failure
- **THEN** an additional hint naming the kubelet and the check command is written to stderr

#### Scenario: Unrelated errors stay untouched

- **GIVEN** a plain SQL error such as a missing relation
- **WHEN** the shared exec path handles the failure
- **THEN** no kubelet hint is emitted

### Requirement: Health gate covers kubelet reachability, not only API-server reachability

The local stack health gate SHALL run the certificate check after its cluster
reachability check.

`kubectl get nodes` is served by the API server and stays green while every
`kubectl exec` fails, so API-server reachability alone does not establish that
the stack is usable.

#### Scenario: API server reachable but kubelet certificate stale

- **GIVEN** the cluster answers `kubectl get nodes`
- **AND** a node's kubelet serving certificate carries a stale SAN
- **WHEN** the health gate runs
- **THEN** it fails and names the certificate check as the failing component
