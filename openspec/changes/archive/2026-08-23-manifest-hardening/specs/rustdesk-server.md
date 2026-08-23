## ADDED Requirements

### Requirement: RustDesk-Server-Pods laufen als Non-Root

Die Deployments `hbbs` und `hbbr` in `k3d/rustdesk-stack/` MÜSSEN auf Pod-Ebene einen
`securityContext` mit `runAsNonRoot: true` und `seccompProfile.type: RuntimeDefault`
setzen und auf Container-Ebene `allowPrivilegeEscalation: false`. Das `workingDir` der
Container DARF NICHT `/root` sein (Mode 700 verhindert den chdir für non-root-UIDs);
die Key-Mounts aus dem Secret `rustdesk-secrets` bleiben read-only und werden auf den
neuen workingDir-Pfad umgezogen. Die hostPorts (21115–21119) bleiben unverändert — sie
liegen oberhalb des privilegierten Bereichs.

#### Scenario: hbbs-Manifest deklariert Non-Root-Härtung

- **GIVEN** das Deployment-Manifest `k3d/rustdesk-stack/hbbs.yaml`
- **WHEN** der Pod-Spec geprüft wird
- **THEN** enthält er `securityContext.runAsNonRoot: true` und
  `securityContext.seccompProfile.type: RuntimeDefault`
- **AND** der hbbs-Container setzt `allowPrivilegeEscalation: false` und ein
  `workingDir` ungleich `/root`

#### Scenario: hbbr-Manifest deklariert Non-Root-Härtung

- **GIVEN** das Deployment-Manifest `k3d/rustdesk-stack/hbbr.yaml`
- **WHEN** der Pod-Spec geprüft wird
- **THEN** enthält er dieselben Härtungsattribute wie hbbs

### Requirement: NetworkPolicy-Bypass-Ausnahme ist dokumentiert

Die `k3d/README.md` MUSS einen Abschnitt enthalten, der die hostNetwork-Pods (coturn,
janus, hbbs, hbbr) auf `${TURN_NODE}`, ihre hostPorts und die bewusste Ausnahme von den
ClusterWide NetworkPolicies beschreibt. Der Abschnitt NENNNT das Node-Pinning via
`nodeSelector: kubernetes.io/hostname: ${TURN_NODE}` als Containment-Maßnahme und
VERWEIST auf nextcloud/collabora als separate, im Manifest begründete Ausnahmen.

#### Scenario: README erklärt die hostNetwork-Ausnahme

- **GIVEN** die `k3d/README.md`
- **WHEN** nach der Begründung gesucht wird, warum coturn/janus/hbbs/hbbr die
  NetworkPolicies umgehen
- **THEN** findet sich ein Abschnitt mit Node-Pinning (`${TURN_NODE}`), hostPort-Liste
  und dem Verweis auf die bewusste NetPol-Ausnahme
