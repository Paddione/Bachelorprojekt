## MODIFIED Requirements

### Requirement: MCP servers are served from a single in-cluster deployment
<!-- bats: dev-pod-mcp-bundle/dev-pod.bats -->

The MCP servers SHALL be served by one `dev-pod` Deployment in namespace `workspace-dev`, delivered
through the Flux GitOps pipeline. The deployment SHALL carry four containers: `mcp-node` (the
Node.js servers under a supervisor), `mcp-kubernetes` (the upstream Go binary), `repo-sync` (the
checkout sidecar) and `dev-shell` (the SSH-reachable development container).

#### Scenario: Deployment is reachable through the Flux pipeline *(BATS)*

- **GIVEN** the `dev-pod` manifest lives under an overlay referenced by a Flux Kustomization
- **WHEN** the overlay is rendered
- **THEN** the deployment appears in the rendered output, so that it does not depend on a manual
  `kubectl apply`

#### Scenario: Playwright is not part of the bundle *(BATS)*

- **GIVEN** the `playwright` MCP server carries a 4 GiB memory limit while every other server stays
  below 512 MiB
- **WHEN** the `dev-pod` containers are declared
- **THEN** `playwright` is absent from them and remains a local stdio server, so that a browser leak
  cannot restart the other MCP servers

## ADDED Requirements

### Requirement: The dev-pod offers SSH access only through the Kubernetes API
<!-- bats: mcp-gateway/dev-shell-ssh.bats -->

The `dev-shell` container SHALL run an OpenSSH server as uid 1000 that listens on the loopback
address `127.0.0.1:22` only, so that `ssh dev-pod` works through the
`kubectl exec -i deploy/dev-pod -- nc 127.0.0.1 22` ProxyCommand and access is gated by the
`pods/exec` permission in `workspace-dev`. No Service port, Ingress, IngressRoute, NodePort or
LoadBalancer SHALL expose port 22. Password and keyboard-interactive authentication and root login
SHALL be disabled. The login names `patrick` and `gekko` SHALL both map to uid 1000 with the shared
home `/home/dev`, and each name SHALL accept only its own public key. The pod SHALL keep
`runAsNonRoot: true` and declare the sysctl `net.ipv4.ip_unprivileged_port_start=0` explicitly.

#### Scenario: SSH is reachable through kubectl exec *(BATS)*

- **GIVEN** the `dev-shell` container declares no `containerPort` 22 and `service.yaml` lists no port 22
- **WHEN** the sshd configuration shipped in the `dev-shell` image is inspected
- **THEN** it listens on `127.0.0.1` only, so that the Pod IP does not answer on port 22 even from the
  WireGuard mesh

#### Scenario: Each login name accepts only its own key *(BATS)*

- **GIVEN** the ConfigMap `dev-pod-authorized-keys` carries the keys `patrick` and `gekko`
- **WHEN** they are compared with `PATRICK_SSH_PUBLIC_KEY` and `GEKKO_SSH_PUBLIC_KEY` in
  `environments/mentolder.yaml`
- **THEN** both values match, so that a key rotation in the environment registry is not silently
  missed by the dev-pod

#### Scenario: Non-root sshd can bind port 22 *(BATS)*

- **GIVEN** the pod runs with `runAsNonRoot: true` and `runAsUser: 1000`
- **WHEN** the pod-level `securityContext` is declared
- **THEN** it sets `net.ipv4.ip_unprivileged_port_start` to `"0"`, so that binding port 22 does not
  depend on the container runtime's default

### Requirement: The dev-shell home survives pod restarts
<!-- bats: mcp-gateway/dev-shell-ssh.bats -->

The `dev-shell` container SHALL mount a dedicated PersistentVolumeClaim `dev-pod-home` at
`/home/dev`, holding the users' working clone, shell and tool configuration and the SSH host key.
It SHALL mount the shared `dev-pod-repo` checkout read-only.

#### Scenario: Host key and working clone persist *(BATS)*

- **GIVEN** the deployment uses `strategy: Recreate`
- **WHEN** the pod is recreated
- **THEN** `/home/dev` is backed by the PVC `dev-pod-home`, so that the host key, the working clone
  and the Claude Code configuration are still present

#### Scenario: dev-shell does not become a second checkout writer *(BATS)*

- **GIVEN** `repo-sync` is the only writer of `dev-pod-repo`
- **WHEN** `dev-shell` mounts the checkout
- **THEN** the mount is read-only, so that development work happens in the clone under `/home/dev`
