---
title: "p1-rustdesk-hardening"
ticket_id: T014553
domains: [infra, security]
status: active
---

# Partial p1 — RustDesk-Hardening + NetPol-Ausnahme-Doku

Implementiert GR-04 (Doku) und den RustDesk-Teil von GR-06 aus
`openspec/changes/manifest-hardening/proposal.md`. Delta-Specs:
`specs/rustdesk-server.md`.

Hintergrund (verifiziert): Node-Pinning via `${TURN_NODE}` existiert bereits in allen
vier hostNetwork-Manifesten; neu sind (a) die Non-Root-Härtung von hbbs/hbbr und
(b) die kanonische Dokumentation der NetworkPolicy-Bypass-Ausnahme.

### Task 1: hbbs.yaml auf Non-Root härten

**Files:** `k3d/rustdesk-stack/hbbs.yaml`

Im Pod-Spec des Deployments `hbbs` ergänzen:

```yaml
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        runAsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
```

Am Container `hbbs`:

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
```

Ports 21115–21118 liegen oberhalb des privilegierten Bereichs — kein CAP_NET_BIND_SERVICE
nötig. `workingDir: /root` ersetzen durch `/var/lib/rustdesk` (Mode 700 auf `/root`
verhindert chdir für non-root-UIDs); hbbs legt seine `.db`-Dateien im workingDir an,
daher neues emptyDir `workdir`, gemountet auf `/var/lib/rustdesk`. Die Key-Mounts
aus dem Secret `rustdesk-secrets` (read-only, subPath) umziehen:

```yaml
            - name: keys
              mountPath: /var/lib/rustdesk/id_ed25519
              subPath: id_ed25519
              readOnly: true
            - name: keys
              mountPath: /var/lib/rustdesk/id_ed25519.pub
              subPath: id_ed25519.pub
              readOnly: true
```

Neues Volume:

```yaml
        - name: workdir
          emptyDir: {}
```

`hostNetwork: true`, `dnsPolicy: ClusterFirstWithHostNet` und der
`nodeSelector` (`${TURN_NODE}`) bleiben unverändert.

### Task 2: hbbr.yaml analog härten

**Files:** `k3d/rustdesk-stack/hbbr.yaml`

Identisches Muster wie Task 1: Pod-securityContext (`runAsNonRoot`, `runAsUser/
runAsGroup 65534`, `seccompProfile RuntimeDefault`), Container-securityContext
(`allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`), `workingDir` auf
`/var/lib/rustdesk`, emptyDir `workdir`. hbbr hat keine Keys und keine Volumes —
nur das neue `workdir`-Volume kommt hinzu.

### Task 3: NetPol-Bypass-Ausnahme in k3d/README.md dokumentieren

**Files:** `k3d/README.md`

Neue Sektion `## hostNetwork-Pods & NetworkPolicy-Ausnahme` (zwischen
`## Sub-directories` und `## Deployment`) mit:

- Tabelle der vier hostNetwork-Workloads (`coturn-stack/coturn.yaml`,
  `coturn-stack/janus.yaml`, `rustdesk-stack/hbbs.yaml`, `rustdesk-stack/hbbr.yaml`)
  mit ihren hostPorts (coturn 3478/5349/49152-49252, janus 20000-20200 + ws 8188,
  hbbs 21115-21116 tcp+udp/21118, hbbr 21117/21119).
- Begründung: hostNetwork-Pods umgehen die ClusterWide NetworkPolicies bewusst —
  TURN/Signaling brauchen rohe UDP/TCP-Sockets, die Traefik nicht routen kann.
- Containment: alle vier sind per `nodeSelector: kubernetes.io/hostname: ${TURN_NODE}`
  auf einen dedizierten Public-Node gepinnt (`${TURN_NODE}` wird per envsubst im
  Deploy-Pfad gesetzt, siehe `scripts/pre-deploy-checks-lib.sh`).
- Verweis, dass nextcloud/collabora separate, im Manifest begründete Ausnahmen sind
  (root-Init-Container bzw. User-Namespace-Sandboxing).

Keine Brand-Domain-Literale einfügen (S3).

## Verify

```bash
task workspace:validate
kustomize build k3d/rustdesk-stack >/dev/null && echo OK
```
