# fleet-operations

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Fleet-Operations-Domain beschreibt die Anforderungen an den konsolidierten k3s-Cluster (`fleet`), der beide Produktivmarken (mentolder, korczewski) auf denselben Control-Plane- und Worker-Nodes betreibt. Es regelt das WireGuard-Full-Mesh-Netzwerk zwischen allen Knoten, das DNS-Cutover-Verfahren beim Übergang auf den Fleet-Cluster sowie die strukturellen Invarianten der Taskfile-gestützten Deployment-Pipeline. Alle Anforderungen leiten sich aus Regressionstests und dokumentierten Ausfällen (insb. 2026-05-31) ab.

---

## Requirements

### Requirement: WireGuard Worker-to-Worker Full Mesh

The system SHALL generate WireGuard configurations that include all sibling worker nodes as peers, so that worker-to-worker pod traffic is never silently dropped.

#### Scenario: Worker-Konfiguration enthält alle anderen Worker-Knoten als Peers

- **GIVEN** ein Fleet-Cluster mit Control-Plane-Knoten (pk-hetzner-4/6/8) und Worker-Knoten (gekko-hetzner-2/3/4)
- **WHEN** `generate-wg-conf.sh --env fleet --node-name gekko-hetzner-4` ausgeführt wird
- **THEN** enthält die Ausgabe Peer-Einträge für `gekko-hetzner-2` (10.20.0.4/32) und `gekko-hetzner-3` (10.20.0.5/32)
- **AND** der eigene Knoten (`gekko-hetzner-4`) erscheint NICHT als Peer in der eigenen Konfiguration

#### Scenario: Control-Plane-Konfiguration enthält alle Worker-Knoten als Peers

- **GIVEN** ein Fleet-Cluster mit gemischten Node-Typen unter dem `workers:`-Schlüssel in der YAML-Konfiguration
- **WHEN** `generate-wg-conf.sh --env fleet --node-name pk-hetzner-4` ausgeführt wird
- **THEN** enthält die Ausgabe Peer-Einträge für `gekko-hetzner-2` (10.20.0.4/32) und `gekko-hetzner-4` (10.20.0.6/32)
- **AND** der eigene Knoten (`pk-hetzner-4`) erscheint NICHT als Peer in der eigenen Konfiguration

---

### Requirement: WireGuard Mesh Symmetry (Exactly N-1 Peers)

The system SHALL generate exactly five peer entries for every fleet node, ensuring a symmetric full mesh across all six fleet nodes.

#### Scenario: Jeder Worker-Knoten erhält exakt 5 Peers

- **GIVEN** ein Fleet-Cluster mit insgesamt 6 Knoten (3 CP + 3 Worker)
- **WHEN** `generate-wg-conf.sh --env fleet` für jeden der drei Worker-Knoten (gekko-hetzner-2, -3, -4) ausgeführt wird
- **THEN** enthält jede erzeugte Konfiguration exakt 5 `[Peer]`-Blöcke — keiner mehr, keiner weniger

---

### Requirement: Fleet DNS Cutover Produces Only A-Records for Allowlisted Prefixes

The system SHALL restrict the DNS cutover change set exclusively to type-A records for a defined set of allowlisted hostname prefixes, and SHALL never modify MX, TXT, CNAME, or mail-related records.

#### Scenario: Plan-Ausgabe für mentolder enthält alle erforderlichen A-Records

- **GIVEN** `PROD_DOMAIN=mentolder.de` und `LIVEKIT_PIN_IP=204.168.244.104` sind gesetzt
- **WHEN** `fleet-dns-cutover.sh plan` ausgeführt wird
- **THEN** enthält die Ausgabe A-Records für `@` (alle drei Fleet-IPs), `*`, `livekit`, `stream` und `turn`
- **AND** alle `CHANGE:`-Zeilen beginnen mit `A|` — kein MX-, TXT-, CNAME- oder Mail-Record ist enthalten

#### Scenario: Plan-Ausgabe enthält keine Mail- oder Nicht-A-Records

- **GIVEN** ein beliebiger PROD_DOMAIN-Wert ist gesetzt
- **WHEN** `fleet-dns-cutover.sh plan` ausgeführt wird
- **THEN** enthält die Ausgabe weder `MX`, `TXT`, `CNAME` noch Substrings wie `mailbox`, `tutanota`, `_dmarc`, `_domainkey`, `mta-sts` oder `spf`

---

### Requirement: Brand-Specific LiveKit/TURN IP Pinning

The system SHALL pin LiveKit and TURN service subdomains to a brand-specific, statically configured IP address that differs per brand, and SHALL never use worker node IPs for these services.

#### Scenario: mentolder LiveKit und TURN werden auf pk-hetzner-4 gepinnt

- **GIVEN** die Umgebungskonfiguration `environments/fleet-mentolder.yaml` ist aktiv
- **WHEN** die Werte `LIVEKIT_PIN_IP` und `TURN_PUBLIC_IP` gelesen werden
- **THEN** enthalten beide den Wert `204.168.244.104` (pk-hetzner-4)
- **AND** die Worker-IPs `46.225.125.59` und `178.104.169.206` (gekko-Knoten) erscheinen NICHT

#### Scenario: korczewski DNS-Plan pinnt LiveKit auf den korczewski-spezifischen CP-Knoten

- **GIVEN** `PROD_DOMAIN=korczewski.de` und `LIVEKIT_PIN_IP=37.27.251.38` sind gesetzt
- **WHEN** `fleet-dns-cutover.sh plan` ausgeführt wird
- **THEN** enthält die Ausgabe `A|livekit|37.27.251.38` und `A|@|204.168.244.104`

---

### Requirement: DNS Cutover Fails Loudly on Missing Environment Variables

The system SHALL abort the DNS cutover script with a non-zero exit code and an informative error message when required environment variables are not set.

#### Scenario: Fehlende Pflicht-Umgebungsvariablen führen zu sofortigem Fehler

- **GIVEN** `PROD_DOMAIN` und `LIVEKIT_PIN_IP` sind nicht gesetzt (unset)
- **WHEN** `fleet-dns-cutover.sh plan` ausgeführt wird
- **THEN** endet das Skript mit Exit-Code ungleich 0
- **AND** die Fehlerausgabe enthält den Substring `not set`

---

### Requirement: DNS Cutover Writes Rollback State File

The system SHALL persist the pre-cutover DNS state to a rollback state file during cutover execution, enabling a safe revert to the previous configuration.

#### Scenario: Cutover erzeugt eine Rollback-Datei im konfigurierten State-Verzeichnis

- **GIVEN** `FLEET_DNS_STATE_DIR` zeigt auf ein beschreibbares Verzeichnis, `IPV64_API_KEY` ist gesetzt
- **WHEN** `fleet-dns-cutover.sh cutover` erfolgreich ausgeführt wird
- **THEN** existiert anschließend die Datei `fleet-dns-rollback-<PROD_DOMAIN>.state` im State-Verzeichnis

---

### Requirement: DNS Rollback Restores Recorded State

The system SHALL restore exactly the DNS records listed in the rollback state file when the rollback subcommand is invoked, and SHALL fail loudly when no state file exists.

#### Scenario: Rollback schreibt die gespeicherten IP-Adressen zurück in die DNS-API

- **GIVEN** eine Rollback-State-Datei mit dem Inhalt `A|@|46.225.125.59` und `A|livekit|46.225.125.59` liegt im State-Verzeichnis
- **WHEN** `fleet-dns-cutover.sh rollback` ausgeführt wird
- **THEN** enthält das Curl-Log mindestens einen API-Aufruf mit `content=46.225.125.59`

#### Scenario: Rollback schlägt fehl wenn keine State-Datei vorhanden ist

- **GIVEN** im State-Verzeichnis existiert keine Rollback-Datei für die aktive Domain
- **WHEN** `fleet-dns-cutover.sh rollback` ausgeführt wird
- **THEN** endet das Skript mit Exit-Code ungleich 0
- **AND** die Ausgabe enthält den Substring `no rollback state`

---

### Requirement: Taskfile Declares Fleet DNS Tasks

The system SHALL declare both `fleet:dns:cutover` and `fleet:dns:rollback` as named tasks in the Taskfile so operators can execute them via the standard task runner interface.

#### Scenario: Beide Fleet-DNS-Tasks sind im Taskfile deklariert

- **GIVEN** das Repository-Root enthält `Taskfile.yml`
- **WHEN** die Datei nach `fleet:dns:cutover:` und `fleet:dns:rollback:` durchsucht wird
- **THEN** sind beide Task-Einträge vorhanden

---

### Requirement: Collabora Ingress Uses office.* Hostname for WOPI Compatibility

The system SHALL configure the Collabora ingress host as `office.<domain>` (not `collabora.<domain>`), so that the Nextcloud `public_wopi_url` resolves correctly.

#### Scenario: fleet:shared-services setzt COLLABORA_HOST auf office-Subdomain

- **GIVEN** der Task `fleet:shared-services` ist im Taskfile definiert
- **WHEN** der Task-Block nach `COLLABORA_HOST` durchsucht wird
- **THEN** enthält der Wert das Präfix `office.` und NICHT `collabora.`

---

### Requirement: Collabora WOPI Aliasgroup Uses files.* Hostname

The system SHALL configure the Collabora WOPI aliasgroup to match the Nextcloud host (`files.<domain>`), not `cloud.<domain>`, to ensure WOPI callbacks resolve to the correct Nextcloud instance.

#### Scenario: fleet:shared-services setzt ALIASGROUP1 auf files-Subdomain

- **GIVEN** der Task `fleet:shared-services` ist im Taskfile definiert
- **WHEN** der Task-Block nach `ALIASGROUP1` durchsucht wird
- **THEN** enthält der Wert `https://files\` und NICHT `https://cloud\`

---

### Requirement: Fleet Deployment Task Existence

The system SHALL expose `fleet:shared-services` and `fleet:talk-setup:brand` as named tasks in the Taskfile to enable modular fleet bring-up.

#### Scenario: Beide Fleet-Infrastruktur-Tasks sind im Taskfile auffindbar

- **GIVEN** das Repository-Root enthält `Taskfile.yml`
- **WHEN** die Datei nach `fleet:shared-services:` und `fleet:talk-setup:brand:` durchsucht wird
- **THEN** sind beide Task-Einträge vorhanden

---

### Requirement: fleet:deploy:brand Includes Core Steps But Excludes talk-setup

The system SHALL ensure that `fleet:deploy:brand` invokes `workspace:deploy`, `mcp:deploy`, and `workspace:post-setup`, but SHALL NOT call `talk-setup` directly (talk-setup is handled separately by `fleet:talk-setup:brand`).

#### Scenario: fleet:deploy:brand enthält Kern-Deploy-Schritte ohne Talk-Setup

- **GIVEN** der Task `fleet:deploy:brand` ist im Taskfile definiert
- **WHEN** der Task-Block analysiert wird
- **THEN** sind `workspace:deploy`, `mcp:deploy` und `workspace:post-setup` im Block enthalten
- **AND** `talk-setup` ist NICHT direkt im Block enthalten

---

### Requirement: fleet:deploy Calls fleet:shared-services Exactly Once

The system SHALL invoke `fleet:shared-services` exactly once within the top-level `fleet:deploy` task, preventing duplicate Collabora/CoTURN configuration across brands.

#### Scenario: Shared-Services wird im Fleet-Deploy nur einmal aufgerufen

- **GIVEN** der Task `fleet:deploy` ist im Taskfile definiert
- **WHEN** der Task-Block nach Referenzen auf `fleet:shared-services` durchsucht wird
- **THEN** erscheint `fleet:shared-services` genau einmal im Block

---

### Requirement: fleet:deploy Executes Steps in Correct Order

The system SHALL guarantee that within `fleet:deploy`, both brand deployments complete before `fleet:shared-services` runs, and `fleet:shared-services` completes before `fleet:talk-setup:brand` runs.

#### Scenario: Deployment-Reihenfolge: Brand-Deploy → Shared-Services → Talk-Setup

- **GIVEN** der Task `fleet:deploy` ist im Taskfile definiert
- **WHEN** die Zeilennummern von `fleet:deploy:brand`, `fleet:shared-services` und `fleet:talk-setup:brand` im Block ermittelt werden
- **THEN** kommt der letzte `fleet:deploy:brand`-Aufruf vor `fleet:shared-services`
- **AND** `fleet:shared-services` kommt vor `fleet:talk-setup:brand`

---

### Requirement: workspace:deploy Gates talk-setup Behind SKIP_TALK_SETUP Flag

The system SHALL allow callers to suppress the embedded `workspace:talk-setup` invocation inside `workspace:deploy` by setting `SKIP_TALK_SETUP=true`, preventing hard failures on fresh fleet clusters where coturn/Janus are not yet available.

#### Scenario: workspace:deploy überspringt Talk-Setup wenn SKIP_TALK_SETUP gesetzt ist

- **GIVEN** der Task `workspace:deploy` ist im Taskfile definiert
- **WHEN** der Task-Block analysiert wird
- **THEN** enthält er einen Aufruf von `workspace:talk-setup` UND eine Bedingungsprüfung auf `SKIP_TALK_SETUP`

#### Scenario: fleet:deploy:brand setzt SKIP_TALK_SETUP=true beim Marken-Deploy

- **GIVEN** der Task `fleet:deploy:brand` ist im Taskfile definiert
- **WHEN** der Task-Block nach `SKIP_TALK_SETUP` durchsucht wird
- **THEN** ist die Variable im Block gesetzt (Wert: `true`)

---

### Requirement: Fleet Environment Uses Correct Root Domain (No Staging Subdomain Infix)

The system SHALL configure `PROD_DOMAIN` in fleet brand environments to the canonical root domain (e.g. `mentolder.de`, `korczewski.de`), never to a staging subdomain such as `fleet-m.korczewski.de` or `fleet.korczewski.de`, because sub-subdomain prefixes cause ipv64 DNS-01 ACME challenges to fail.

#### Scenario: fleet-mentolder verwendet mentolder.de als PROD_DOMAIN

- **GIVEN** die Datei `environments/fleet-mentolder.yaml` ist vorhanden
- **WHEN** der `PROD_DOMAIN`-Wert gelesen wird
- **THEN** enthält er `mentolder.de` und enthält NICHT `fleet-m.korczewski.de`
- **AND** die Datei enthält keinerlei Referenz auf `fleet-m.korczewski.de`

#### Scenario: fleet-korczewski verwendet korczewski.de als PROD_DOMAIN

- **GIVEN** die Datei `environments/fleet-korczewski.yaml` ist vorhanden
- **WHEN** der `PROD_DOMAIN`-Wert gelesen wird
- **THEN** enthält er `korczewski.de` und enthält NICHT `fleet.korczewski.de`
- **AND** die Datei enthält keinerlei Referenz auf `fleet.korczewski.de`

---

### Requirement: cert:install Wires IPV64_API_KEY Into Lego Webhook

The system SHALL inject the `IPV64_API_KEY` from the existing `cert-manager/ipv64-api-key` Secret into the lego webhook Deployment during `cert:install`, so that DNS-01 ACME challenges succeed on fresh cluster bring-up without requiring a separate `cert:secret` invocation.

#### Scenario: cert:install setzt IPV64_API_KEY im Lego-Webhook-Deployment

- **GIVEN** der Task `cert:install` ist im Taskfile definiert
- **WHEN** der Task-Block nach Webhook-Konfiguration durchsucht wird
- **THEN** enthält er eine Referenz auf `cert-manager-lego-webhook` und einen Befehl, der `IPV64_API_KEY` aus dem Secret `ipv64-api-key` setzt (`set env` oder `--from=secret/ipv64-api-key`)

---

### Requirement: Traefik Delivers the Real Client IP Without a ServiceLB Hop
The shared `kube-system/traefik` Service on the fleet cluster SHALL deliver the
real external client IP to backend services without an intermediate
re-originating proxy hop. The Service SHALL NOT be of `type: LoadBalancer`
(which causes k3s' ServiceLB/`klipper-lb` to manage it); Traefik's own
DaemonSet pods SHALL bind ports 80 and 443 directly via `hostPort` on each of
the 3 public Hetzner nodes.

#### Scenario: Service type prevents klipper-lb from managing the Traefik Service
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `service.spec.type` is `ClusterIP`
- **AND** no `svclb-traefik` DaemonSet pods exist in `kube-system` on the fleet cluster

#### Scenario: Traefik pods bind host ports directly
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `ports.web.hostPort` is `80` and `ports.websecure.hostPort` is `443`

#### Scenario: Real client IP reaches backend services
- **WHEN** an external client sends a request to `auth.${PROD_DOMAIN}` with a
  distinguishing User-Agent
- **THEN** Pocket ID's access logs show the client's real external IP
  (not a `10.42.0.0/16` pod-CIDR address belonging to a ServiceLB pod)

### Requirement: Traefik DaemonSet Rolling Update Avoids hostPort Conflicts
Because `hostPort`-bound pods cannot share a port on the same node, the
Traefik DaemonSet's update strategy SHALL evict the old pod on a node before
scheduling its replacement there.

#### Scenario: Rolling update strategy prevents same-node port collisions
- **WHEN** `prod/traefik-values.yaml` is inspected
- **THEN** `updateStrategy.rollingUpdate.maxUnavailable` is `1`
- **AND** `updateStrategy.rollingUpdate.maxSurge` is `0`

### Requirement: Traefik Service Preserves Real Client IP

The shared `kube-system/traefik` Service SHALL be configured so that backend
services behind Traefik (e.g. Pocket ID) observe the real external client IP
address instead of a cluster-internal pseudo-IP, so that per-client
rate-limiting and audit logging operate correctly.

#### Scenario: Traefik values declare externalTrafficPolicy Local

- **GIVEN** the repo-tracked `prod/traefik-values.yaml` Helm values file for
  the fleet's shared Traefik release
- **WHEN** the file is inspected
- **THEN** `service.spec.externalTrafficPolicy` is `Local`
- **AND** `deployment.kind` is `DaemonSet`

#### Scenario: Traefik DaemonSet topology covers every public entry node

- **GIVEN** `prod/traefik-values.yaml` sets `externalTrafficPolicy: Local`
  (which causes kube-proxy to drop Service traffic on any node lacking a
  local backend pod)
- **WHEN** the node affinity in the same file is inspected
- **THEN** it matches exactly the three public Hetzner nodes that DNS for
  `*.${PROD_DOMAIN}` resolves to (`pk-hetzner-4`, `pk-hetzner-6`,
  `pk-hetzner-8`)

#### Scenario: Future full-cluster bootstrap installs the tracked values file

- **GIVEN** `prod/cloud-init.yaml` (used to bootstrap a brand-new fleet
  cluster from scratch)
- **WHEN** the Traefik Helm install step is inspected
- **THEN** it installs from the repo-tracked `prod/traefik-values.yaml`
  (fetched via `curl`) rather than inline `--set` flags, so a fresh
  full-cluster rebuild does not regress to the old (real-IP-losing) default
  `externalTrafficPolicy: Cluster` behavior

#### Scenario: No orphaned/unused Traefik values files remain

- **GIVEN** the repo previously contained an unused
  `prod-korczewski/traefik-values.yaml` (zero references anywhere in the
  repo, never wired into any install/upgrade path)
- **WHEN** the repo is inspected after this change
- **THEN** that file no longer exists — its intent is consolidated into the
  single, actually-applied `prod/traefik-values.yaml`

### Requirement: Brand-Specific TURN IP Pinning

The system SHALL pin the TURN service subdomain to a brand-specific, statically configured IP
address that differs per brand, and SHALL never use worker node IPs for that service. The
former LiveKit pin is removed together with the LiveKit stack (T002184); `LIVEKIT_PIN_IP` is no
longer a recognised environment variable.

#### Scenario: mentolder TURN wird auf pk-hetzner-4 gepinnt

- **GIVEN** the environment configuration `environments/fleet-mentolder.yaml` is active
- **WHEN** the value `TURN_PUBLIC_IP` is read
- **THEN** it contains the pk-hetzner-4 control-plane IP
- **AND** the gekko worker IPs do NOT appear
- **AND** no `LIVEKIT_PIN_IP` key is present in the file

#### Scenario: korczewski DNS-Plan pinnt TURN auf den korczewski-spezifischen CP-Knoten

- **GIVEN** `PROD_DOMAIN=korczewski.de` and `TURN_PUBLIC_IP` are set
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the output contains the `turn` A-record for the brand-specific control-plane node
- **AND** the output contains no `livekit` and no `stream` A-record

### Requirement: DNS-Cutover-Plan enthält nur A-Records

The system SHALL emit only `A|` change lines from `fleet-dns-cutover.sh plan`, covering `@`,
`*` and `turn`, and SHALL NOT emit records for the removed `livekit` and `stream` subdomains.

#### Scenario: Plan-Ausgabe für mentolder enthält alle erforderlichen A-Records

- **GIVEN** `PROD_DOMAIN=mentolder.de` and `TURN_PUBLIC_IP` are set
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the output contains A-records for `@` (all three fleet IPs), `*` and `turn`
- **AND** every `CHANGE:` line starts with `A|` — no MX, TXT, CNAME or mail record is included
- **AND** neither `livekit` nor `stream` appears in the output

#### Scenario: Fehlende Pflicht-Umgebungsvariablen führen zu sofortigem Fehler

- **GIVEN** `PROD_DOMAIN` and `TURN_PUBLIC_IP` are unset
- **WHEN** `fleet-dns-cutover.sh plan` is executed
- **THEN** the script exits with a non-zero exit code
- **AND** the error output contains the substring `not set`

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

### Requirement: Cluster Membership Matches the Declared Node Registry

The system SHALL provide a check that compares the node set declared in `wireguard/wg-mesh-nodes.yaml` against the nodes actually registered in the `fleet` cluster, so that a node silently leaving the cluster is detected instead of persisting undetected for weeks.

#### Scenario: Declared node missing from the cluster is reported

- **GIVEN** `wireguard/wg-mesh-nodes.yaml` declares `gekko-hetzner-2` as a fleet node
- **AND** `kubectl --context fleet get nodes` does not list `gekko-hetzner-2`
- **WHEN** the membership check runs
- **THEN** it exits non-zero
- **AND** its output names `gekko-hetzner-2` as declared-but-absent

#### Scenario: Fully consistent node set passes

- **GIVEN** every node declared in `wireguard/wg-mesh-nodes.yaml` is registered in the cluster
- **WHEN** the membership check runs
- **THEN** it exits zero
- **AND** its output reports no drift

### Requirement: Dedicated Development Node Repels Production Workloads

The system SHALL mark the development node with the taint `role=dev:NoSchedule` and a matching label, so that production workloads can never be scheduled onto it by accident.

#### Scenario: Development node carries taint and label

- **GIVEN** `gekko-hetzner-2` has joined the fleet cluster as a worker
- **WHEN** its node object is inspected
- **THEN** it carries the label `role=dev`
- **AND** it carries the taint `role=dev` with effect `NoSchedule`

#### Scenario: Production pod without toleration is not scheduled onto the development node

- **GIVEN** the development node carries the `role=dev:NoSchedule` taint
- **WHEN** a pod without a matching toleration is scheduled
- **THEN** it is not placed on the development node

#### Scenario: Development stack tolerates the taint and targets the node

- **GIVEN** the rendered `workspace-dev` manifests
- **WHEN** their pod specs are inspected
- **THEN** each declares a toleration for `role=dev` with effect `NoSchedule`
- **AND** each declares node affinity requiring the label `role=dev`

### Requirement: Cluster Development Stack Has Its Own Environment File

The system SHALL resolve `DEV_DOMAIN` for the fleet-rendered development stack from an environment file distinct from the one describing the local k3d environment, so that a local environment without a public domain cannot disable the cluster development stack.

#### Scenario: Renderer sources the cluster development environment

- **GIVEN** `environments/dev-cluster.yaml` declares a non-empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the rendered `dev/` directory contains the development stack workloads
- **AND** the rendered output is not the empty placeholder kustomization

#### Scenario: Local environment file no longer controls the cluster stack

- **GIVEN** `environments/dev.yaml` declares no `DEV_DOMAIN`
- **AND** `environments/dev-cluster.yaml` declares a non-empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the development stack is still rendered

#### Scenario: Empty cluster development domain still disables the stack

- **GIVEN** `environments/dev-cluster.yaml` declares an empty `DEV_DOMAIN`
- **WHEN** `scripts/flux-render-artifact.sh` renders the artifact
- **THEN** the rendered `dev/` directory contains a valid but empty kustomization
- **AND** the renderer exits zero

### Requirement: Kubernetes API Is Reachable Through Every Control-Plane Node

The system SHALL include the public address of every control-plane node in the API server certificate, so that external cluster access does not depend on a single node.

#### Scenario: Each control-plane node declares its public address as a TLS SAN

- **GIVEN** the k3s configuration of a control-plane node
- **WHEN** `/etc/rancher/k3s/config.yaml` is inspected
- **THEN** it declares a `tls-san` entry containing that node's public address

#### Scenario: API certificate covers all control-plane addresses

- **GIVEN** the served API certificate of the fleet cluster
- **WHEN** its subject alternative names are inspected
- **THEN** they include the public address of each control-plane node

### Requirement: Wildcard-Certificate ohne Reflector-Annotationen (T002880)

The system SHALL NOT carry `reflector.v1.emberstack.eu` annotations in the
wildcard Certificate manifests (`prod/wildcard-certificate.yaml` and
`prod-fleet/staging/wildcard-certificate.yaml`), because no Reflector controller
runs in the fleet cluster. The TLS secret copies to the `coturn`,
`workspace-office` and website namespaces SHALL be maintained by the `tls-sync`
CronJob declared in `prod/reflector.yaml`.

#### Scenario: Manifeste behaupten keine Reflector-Automatik

- **GIVEN** das Repo liegt in seinem erwarteten Zustand vor
- **WHEN** `prod/wildcard-certificate.yaml`, `prod-fleet/staging/wildcard-certificate.yaml` und `prod/reflector.yaml` geprüft werden
- **THEN** enthält keines der Wildcard-Certificate-Manifeste eine `reflector.v1.emberstack.eu`-Annotation
- **AND** `prod/reflector.yaml` deklariert den `tls-sync` CronJob als Sync-Mechanismus

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: WireGuard Worker-to-Worker Full Mesh (Regression T000371)
<!-- bats: wg-mesh-fullmesh.bats -->

The system SHALL generate WireGuard configurations in which every fleet node — including worker nodes under the `workers:` YAML key — appears as a peer in every other node's config, producing a genuine full mesh (N-1 peers per node).

#### Scenario: Worker-Konfiguration enthält CP- und alle sibling-Worker als Peers *(BATS)*
- **GIVEN** ein Fleet-Cluster mit 3 CP-Knoten (pk-hetzner-4/6/8) und 3 Worker-Knoten (gekko-hetzner-2/3/4); `generate-wg-conf.sh` liegt vor
- **WHEN** `generate-wg-conf.sh --env fleet --node-name gekko-hetzner-4 --private-key <key>` ausgeführt wird
- **THEN** enthält die Ausgabe AllowedIPs-Einträge für CP-Knoten (10.20.0.1/32) und die sibling-Worker gekko-hetzner-2 (10.20.0.4/32) sowie gekko-hetzner-3 (10.20.0.5/32)
- **AND** `# gekko-hetzner-4` (der eigene Knoten) erscheint NICHT in der Ausgabe

#### Scenario: CP-Konfiguration enthält alle Worker-Knoten als Peers *(BATS)*
- **GIVEN** der selbe Fleet-Cluster; `generate-wg-conf.sh` liegt vor
- **WHEN** `generate-wg-conf.sh --env fleet --node-name pk-hetzner-4 --private-key <key>` ausgeführt wird
- **THEN** enthält die Ausgabe AllowedIPs-Einträge für `gekko-hetzner-2` (10.20.0.4/32) und `gekko-hetzner-4` (10.20.0.6/32)
- **AND** `# pk-hetzner-4` (der eigene Knoten) erscheint NICHT in der Ausgabe

#### Scenario: Jeder Worker-Knoten hat exakt 5 Peers (symmetrisches Full Mesh) *(BATS)*
- **GIVEN** ein Fleet-Cluster mit 6 Knoten gesamt (3 CP + 3 Worker)
- **WHEN** `generate-wg-conf.sh --env fleet` für jeden der drei Worker (gekko-hetzner-2, -3, -4) ausgeführt wird
- **THEN** enthält jede erzeugte Konfiguration exakt 5 `[Peer]`-Blöcke — keiner mehr, keiner weniger

---

### Requirement: Cloud-Init Template Rendering
<!-- bats: render-cloud-init.bats -->

The system SHALL render cloud-init templates by substituting all required variables (NODE_IP, K3S_VERSION, K3S_URL, SSH_PUBLIC_KEY) from a versions file and CLI arguments, and SHALL fail loudly when required inputs are missing.

#### Scenario: Substitution von NODE_IP, K3S_VERSION, K3S_URL und SSH_PUBLIC_KEY *(BATS)*
- **GIVEN** eine versions.yaml mit `k3s: v9.99.0+k3s1` und ein minimales cloud-init Template mit `${NODE_IP}`, `${K3S_VERSION}`, `${K3S_URL}`, `${SSH_PUBLIC_KEY}` als Platzhaltern
- **WHEN** `render-cloud-init.sh --node-ip 1.2.3.4 --k3s-url https://192.168.100.1:6443 --k3s-token testtoken --ssh-key "ssh-ed25519 AAAA testkey" ...` ausgeführt wird
- **THEN** enthält die Ausgabe `NODE_IP=1.2.3.4`, `K3S_VERSION=v9.99.0+k3s1`, `K3S_URL=https://192.168.100.1:6443` und den SSH-Key-String; die Ausgabe beginnt mit `#cloud-config`

#### Scenario: Fehlende Pflicht-Parameter führen zu sofortigem Fehler *(BATS)*
- **GIVEN** `render-cloud-init.sh` wird aufgerufen
- **WHEN** `--node-ip` fehlt, oder die versions-Datei nicht existiert, oder das Template nicht existiert
- **THEN** endet das Skript mit Exit-Code ungleich 0 und die Ausgabe enthält einen Hinweis auf den fehlenden Parameter (z. B. `node-ip`, `versions file`, `template`)

---

### Requirement: Umgebungsvariablen-Auflösung (env-resolve)
<!-- bats: env-resolve.bats -->

The system SHALL resolve all environment variables from YAML config files (including multi-line continuation values), export convenience variables (ENV_CONTEXT, ENV_DOMAIN, ENV_OVERLAY), apply schema default_dev fallbacks for missing keys in dev, and fail loudly when the env name or file is absent.

#### Scenario: Mehrzeiliger STRIPE_PUBLISHABLE_KEY wird vollständig aufgelöst *(BATS)*
- **GIVEN** `prod.yaml` enthält `STRIPE_PUBLISHABLE_KEY` als YAML-Fortsetzungszeile (107 Zeichen gesamt)
- **WHEN** `env-resolve.sh prod` gesourct wird
- **THEN** exportiert `$STRIPE_PUBLISHABLE_KEY` alle 107 Zeichen ohne Abschneiden

#### Scenario: Einzeilige env_vars und setup_vars werden korrekt exportiert *(BATS)*
- **GIVEN** `prod.yaml` mit `PROD_DOMAIN: example.test` und `KC_USER1_USERNAME: alice`
- **WHEN** `env-resolve.sh prod` gesourct wird
- **THEN** sind `$PROD_DOMAIN=example.test` und `$KC_USER1_USERNAME=alice` exportiert; `$ENV_CONTEXT`, `$ENV_DOMAIN` und `$ENV_OVERLAY` enthalten die Top-Level-Werte aus der Datei

#### Scenario: Dev-Fallback auf default_dev bei fehlendem Key *(BATS)*
- **GIVEN** `dev.yaml` enthält den Schema-Key `MISSING_IN_ENV` nicht; Schema definiert `default_dev: "dev-fallback"`
- **WHEN** `env-resolve.sh dev` gesourct wird
- **THEN** ist `$MISSING_IN_ENV=dev-fallback` exportiert; in prod bleibt dieselbe Variable ungesetzt

#### Scenario: Fehlende oder ungültige Umgebungsangabe schlägt laut fehl *(BATS)*
- **GIVEN** kein Env-Name oder ein nicht vorhandener Name wird übergeben
- **WHEN** `env-resolve.sh ''` oder `env-resolve.sh does-not-exist` gesourct wird
- **THEN** Exit-Code ist ungleich 0; die Ausgabe enthält `Usage:` bzw. `Environment file not found`

#### Scenario: ENV=staging löst Overlay, Namespace und Brand korrekt auf *(BATS)*
- **GIVEN** `staging.yaml` mit `overlay: prod-fleet/staging`, `workspace_namespace: workspace-staging`, `brand_id: staging`
- **WHEN** `env-resolve.sh staging` gesourct wird
- **THEN** sind `$ENV_CONTEXT=fleet`, `$ENV_OVERLAY=prod-fleet/staging`, `$WORKSPACE_NAMESPACE=workspace-staging`, `$WEBSITE_NAMESPACE=website-staging` und `$BRAND_ID=staging` exportiert

---

### Requirement: Umgebungsvariablen-Validierung (env-validate)
<!-- bats: env-validate.bats -->

The system SHALL validate environment configs against the schema (required keys, regex patterns, placeholder detection, sealed-secret file presence, sealed-secret key completeness), and SHALL reject invalid or incomplete configs with informative error messages.

#### Scenario: Gültige dev- und prod-Umgebungen bestehen Validierung *(BATS)*
- **GIVEN** `dev.yaml` und `prod.yaml` entsprechen dem Schema vollständig
- **WHEN** `env-validate.sh --env dev --schema-only` und `--env prod --schema-only` ausgeführt werden
- **THEN** enden beide Aufrufe mit Exit-Code 0

#### Scenario: Fehlender Required-Key schlägt Validierung mit Namenshinweis *(BATS)*
- **GIVEN** `missing-key.yaml` enthält `CONTACT_EMAIL` nicht
- **WHEN** `env-validate.sh --env missing-key --schema-only` ausgeführt wird
- **THEN** Exit-Code ungleich 0; Ausgabe enthält `CONTACT_EMAIL`

#### Scenario: Regex-Verletzung und Platzhalter-Werte werden abgewiesen *(BATS)*
- **GIVEN** `bad-regex.yaml` enthält `PROD_DOMAIN: "INVALID DOMAIN!"` und `CONTACT_EMAIL: not-an-email`; `placeholder.yaml` enthält `yourdomain.tld` als Wert
- **WHEN** `env-validate.sh --env bad-regex --schema-only` bzw. `--env placeholder --schema-only` ausgeführt wird
- **THEN** Exit-Code ungleich 0; Ausgabe nennt jeweils den verletzenden Wert oder Schlüssel

#### Scenario: Fehlende oder unvollständige SealedSecret-Datei schlägt Validierung *(BATS)*
- **GIVEN** `no-sealed.yaml` referenziert `sealed-secrets/nonexistent.yaml`; `partial-sealed.yaml` fehlt `NEXTCLOUD_DB_PASSWORD`
- **WHEN** `env-validate.sh --env no-sealed --schema-only` bzw. `--env partial-sealed --schema-only` ausgeführt wird
- **THEN** Exit-Code ungleich 0; Ausgabe nennt den fehlenden Dateipfad bzw. Key

#### Scenario: Drift-Erkennung läuft fehlerfrei bei konsistenten Envs *(BATS)*
- **GIVEN** ein Verzeichnis mit konsistenten `dev.yaml` und `prod.yaml` (kein Schema-Drift)
- **WHEN** `env-validate.sh --drift --schema-only` ausgeführt wird
- **THEN** Exit-Code 0

---

### Requirement: Kustomize Manifest-Struktur
<!-- bats: manifests.bats -->

The system SHALL produce a valid, non-empty kustomize output that declares all core deployments (Pocket ID, Nextcloud, Collabora, Vaultwarden, Mailpit, shared-db), an Ingress with hosts for auth/files/office/vault/mail, no :latest tags on non-exempted images, namespace consistency (workspace or cluster-scoped), and required ConfigMaps.

#### Scenario: kustomize build erfolgreich und nicht leer *(BATS)*
- **GIVEN** `k3d/` enthält eine gültige `kustomization.yaml` und `secrets.yaml` (oder ein Dummy)
- **WHEN** `kubectl kustomize k3d/ --load-restrictor=LoadRestrictionsNone` ausgeführt wird
- **THEN** Exit-Code 0; Ausgabe ist nicht leer; Namespace `workspace` ist deklariert

#### Scenario: Alle Core-Deployments und Ingress-Hosts sind vorhanden *(BATS)*
- **GIVEN** das gerenderte Manifest-Set liegt vor
- **WHEN** nach Deployment-Namen (pocket-id, nextcloud, shared-db, collabora, vaultwarden, mailpit) und Ingress-Hosts (auth, files, office, vault, mail) gesucht wird
- **THEN** sind alle genannten Namen und Hosts in der Ausgabe vorhanden

#### Scenario: Keine Core-Images mit :latest-Tag *(BATS)*
- **GIVEN** das gerenderte Manifest-Set liegt vor (MCP-Sidecars und explizit exemptierte Images ausgenommen)
- **WHEN** alle `image:`-Zeilen auf das Suffix `:latest` geprüft werden
- **THEN** kein Core-Service-Image verwendet `:latest`; alle Images haben ein explizites Tag oder Digest

#### Scenario: Alle Ressourcen im Namespace workspace oder cluster-scoped *(BATS)*
- **GIVEN** das gerenderte Manifest-Set liegt vor
- **WHEN** alle `namespace:`-Felder geprüft werden
- **THEN** erscheinen nur `workspace`, `kube-system` oder `website` — keine anderen Namespace-Werte

---

### Requirement: Service-Verfügbarkeit im Fleet-Cluster (NFA-03)
<!-- e2e: nfa-03-availability.spec.ts -->

The system SHALL serve Vaultwarden, the website, and Pocket ID with HTTP 200/301/302 responses and SHALL not produce 502/503/504 gateway errors on the website root.

#### Scenario: Vaultwarden, Website und Pocket ID sind erreichbar *(E2E)*
- **GIVEN** der Fleet-Cluster ist deployt; `VAULTWARDEN_URL`, `WEBSITE_URL` und `KEYCLOAK_URL` zeigen auf die konfigurierten Endpunkte (der Variablenname `KEYCLOAK_URL` ist eine Migrations-Altlast und wird in `tests/e2e/specs/nfa-03-availability.spec.ts:31` weiterhin so gelesen; sein Wert zeigt auf Pocket ID)
- **WHEN** GET-Requests auf `/alive` (Vaultwarden), `/` (Website) und die Pocket-ID-Root gesendet werden
- **THEN** sind die HTTP-Status-Codes jeweils 200, 301 oder 302; der Website-Body enthält keine `502 Bad Gateway`-, `503`- oder `504`-Texte

---

### Requirement: Skalierbarkeit — parallele Request-Verarbeitung (NFA-04)
<!-- e2e: nfa-04-scalability.spec.ts -->

The system SHALL handle at least 3 concurrent HTTP requests to the website and to Pocket ID's health endpoint without returning errors.

#### Scenario: Website und Pocket ID verarbeiten 3 parallele Requests *(E2E)*
- **GIVEN** der Fleet-Cluster ist deployt; Pocket ID beantwortet `/.well-known/openid-configuration` — Pocket ID hat keinen `/health/ready`-Endpunkt, dieser Pfad ist auch die Liveness-/Readiness-Probe des Deployments (`k3d/pocket-id.yaml:293`, `:300`)
- **WHEN** 3 simultane GET-Requests auf Website-Root bzw. den Pocket-ID-Health-Pfad gesendet werden
- **THEN** antworten alle 3 Requests jeweils mit Status 200, 301 oder 302

---

### Requirement: Statisches DNS mit ipv64 DNS-01-Challenge (NFA-09)
<!-- e2e: nfa-09-static-dns.spec.ts -->

The system SHALL NOT include a DDNS updater manifest in prod/, SHALL have a wildcard-certificate.yaml, and SHALL configure the ClusterIssuer to use ipv64 DNS-01 challenges.

#### Scenario: Kein DDNS-Updater-Manifest; ClusterIssuer nutzt ipv64 DNS-01 *(E2E)*
- **GIVEN** das Repository liegt in seinem erwarteten Zustand vor
- **WHEN** `prod/ddns-updater.yaml`, `prod/wildcard-certificate.yaml` und `prod/cluster-issuer.yaml` geprüft werden
- **THEN** existiert `ddns-updater.yaml` NICHT; `wildcard-certificate.yaml` existiert; `cluster-issuer.yaml` enthält `ipv64` und matcht `/dns01|dns-01/i`

---

### Requirement: Unified Fleet — Korczewski Deploy Gate (NFA-13)
<!-- e2e: nfa-13-fleet-unified-cluster.spec.ts -->

The system SHALL serve the korczewski brand (website root, TLS, OIDC discovery, Arena) from the unified fleet cluster, with each check returning the expected status without TLS errors.

#### Scenario: korczewski Website, TLS-Handshake, OIDC-Discovery und Arena auf Fleet *(E2E)*
- **GIVEN** `KORCZEWSKI_URL` zeigt auf `https://web.korczewski.de`; Fleet-Cluster ist hochgefahren (prod-URLs aktiv)
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery-Endpoint (`/.well-known/openid-configuration`), `/healthz` (Arena) gesendet werden; TLS-Handshake wird ohne `ignoreHTTPSErrors` durchgeführt
- **THEN** Website-Root und TLS-Handshake liefern Status < 500; OIDC-Discovery liefert 200 und `body.issuer` enthält `korczewski`; Arena `/healthz` liefert 200

---

### Requirement: System-weiter Service-Health-Sweep (NFA-INFRA)
<!-- e2e: nfa-infra-health-sweep.spec.ts -->

The system SHALL respond to HTTP health probes on all 17 workspace services (website, Pocket ID, Nextcloud, Collabora, Vaultwarden, Mailpit, and others) with the expected status codes when PROD_DOMAIN is set.

#### Scenario: Alle Core-Services antworten auf HTTP-Health-Probes *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist auf `mentolder.de` (oder eine andere Produktivdomain) gesetzt; alle Services sind deployt
- **WHEN** GET-Requests auf `web.<domain>/`, `web.<domain>/api/health`, `auth.<domain>/.well-known/openid-configuration`, `files.<domain>/status.php`, `office.<domain>/hosting/discovery`, `vault.<domain>/alive` und `mail.<domain>/` gesendet werden
- **THEN** Website liefert 200; `/api/health` liefert `{ok: true}`; OIDC-Discovery liefert 200 mit `issuer` und `authorization_endpoint`; Nextcloud liefert `installed: true`; Collabora liefert 200 mit XML/text Content-Type; Vaultwarden liefert 200; Mailpit liefert Status < 500

---

### Requirement: Multi-Brand Health und Provider-Isolation (SA-15)
<!-- e2e: sa-15-cross-cluster-health.spec.ts -->

The system SHALL serve both brands (mentolder and korczewski) independently from the unified fleet cluster, with each brand running its own Pocket ID instance in its own namespace (issuer containing the brand domain), valid TLS certificates, and brand-specific services (Arena on korczewski).

#### Scenario: mentolder Website, OIDC und Nextcloud auf Fleet *(E2E)*
- **GIVEN** `WEBSITE_URL` zeigt auf `https://web.mentolder.de`; Fleet-Cluster ist hochgefahren (prod-URLs aktiv)
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery (`auth.mentolder.de`) und Nextcloud (`files.mentolder.de/status.php`) gesendet werden; TLS-Handshake wird ohne `ignoreHTTPSErrors` durchgeführt
- **THEN** Website-Root liefert 200; OIDC-Discovery liefert 200 und `body.issuer` enthält `mentolder`; Nextcloud liefert `installed: true`; kein TLS-Zertifikatsfehler

#### Scenario: korczewski Website, OIDC, Brett und Arena auf Fleet — Provider-Isolation *(E2E)*
- **GIVEN** `KORCZEWSKI_URL` zeigt auf `https://web.korczewski.de`; korczewski-Brand ist auf Fleet deployt (korczewskiUp-Vorprüfung erfolgreich)
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery (`auth.korczewski.de`), Brett-Root und Arena `/healthz` gesendet werden; TLS-Handshake ohne `ignoreHTTPSErrors`
- **THEN** Website-Root liefert 200; OIDC-Discovery liefert 200 und `body.issuer` enthält `korczewski`; Brett-Root liefert Status < 500; Arena liefert 200; kein TLS-Zertifikatsfehler
- **AND** der korczewski-Issuer enthält NICHT `mentolder` (Isolation über getrennte Pocket-ID-Instanzen in `workspace` und `workspace-korczewski`, nicht über Realms innerhalb einer Instanz)

---

### Requirement: Integration Smoke — Vollständige Service-Erreichbarkeit
<!-- e2e: integration-smoke.spec.ts -->

The system SHALL pass smoke tests for Pocket ID OIDC discovery (issuer, endpoints), Nextcloud (installed, not maintenance, no DB upgrade needed), Collabora (WOPI discovery XML), Nextcloud Talk signaling, Vaultwarden (/alive), and the Docs site (200/302/401 acceptable).

#### Scenario: Pocket ID OIDC, Nextcloud, Collabora, Talk, Vaultwarden und Docs im Smoke-Test *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt; alle genannten Services sind deployt
- **WHEN** Smoke-Requests auf OIDC-Discovery, `files.<domain>/status.php`, `office.<domain>/hosting/discovery`, `signaling.<domain>/api/v1/welcome`, `vault.<domain>/alive` und `docs.<domain>/` gesendet werden
- **THEN** OIDC liefert `issuer` und `authorization_endpoint` mit Domainbezug; Nextcloud ist `installed: true`, `maintenance: false`, `needsDbUpgrade: false`; Collabora-Response enthält `wopi-discovery`; Talk antwortet mit 200 (503 gilt als fixme-bekannt); Vaultwarden ist erreichbar; Docs liefert 200, 302 oder 401

<!-- merged from change delta fleet-operations.md on 2026-06-30 -->

<!-- merged from change delta fleet-operations.md on 2026-07-01 -->

<!-- merged from change delta fleet-operations.md (14e19aac7c5c) -->

<!-- merged from change delta fleet-operations.md (be0a249b9a2e) -->

<!-- merged from change delta fleet-operations.md (383ea450f657) -->

<!-- merged from change delta fleet-operations.md (cff77522a3d8) -->