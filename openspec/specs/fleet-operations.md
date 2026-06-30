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
- **GIVEN** `no-sealed.yaml` referenziert `sealed-secrets/nonexistent.yaml`; `partial-sealed.yaml` fehlt `KEYCLOAK_ADMIN_PASSWORD`
- **WHEN** `env-validate.sh --env no-sealed --schema-only` bzw. `--env partial-sealed --schema-only` ausgeführt wird
- **THEN** Exit-Code ungleich 0; Ausgabe nennt den fehlenden Dateipfad bzw. Key

#### Scenario: Drift-Erkennung läuft fehlerfrei bei konsistenten Envs *(BATS)*
- **GIVEN** ein Verzeichnis mit konsistenten `dev.yaml` und `prod.yaml` (kein Schema-Drift)
- **WHEN** `env-validate.sh --drift --schema-only` ausgeführt wird
- **THEN** Exit-Code 0

---

### Requirement: Kustomize Manifest-Struktur
<!-- bats: manifests.bats -->

The system SHALL produce a valid, non-empty kustomize output that declares all core deployments (Keycloak, Nextcloud, Collabora, Vaultwarden, Mailpit, shared-db), an Ingress with hosts for auth/files/office/vault/mail, no :latest tags on non-exempted images, namespace consistency (workspace or cluster-scoped), and required ConfigMaps.

#### Scenario: kustomize build erfolgreich und nicht leer *(BATS)*
- **GIVEN** `k3d/` enthält eine gültige `kustomization.yaml` und `secrets.yaml` (oder ein Dummy)
- **WHEN** `kubectl kustomize k3d/ --load-restrictor=LoadRestrictionsNone` ausgeführt wird
- **THEN** Exit-Code 0; Ausgabe ist nicht leer; Namespace `workspace` ist deklariert

#### Scenario: Alle Core-Deployments und Ingress-Hosts sind vorhanden *(BATS)*
- **GIVEN** das gerenderte Manifest-Set liegt vor
- **WHEN** nach Deployment-Namen (keycloak, nextcloud, shared-db, collabora, vaultwarden, mailpit) und Ingress-Hosts (auth, files, office, vault, mail) gesucht wird
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

The system SHALL serve Vaultwarden, the website, and Keycloak with HTTP 200/301/302 responses and SHALL not produce 502/503/504 gateway errors on the website root.

#### Scenario: Vaultwarden, Website und Keycloak sind erreichbar *(E2E)*
- **GIVEN** der Fleet-Cluster ist deployt; `VAULTWARDEN_URL`, `WEBSITE_URL` und `KEYCLOAK_URL` zeigen auf die konfigurierten Endpunkte
- **WHEN** GET-Requests auf `/alive` (Vaultwarden), `/` (Website) und Keycloak-Root gesendet werden
- **THEN** sind die HTTP-Status-Codes jeweils 200, 301 oder 302; der Website-Body enthält keine `502 Bad Gateway`-, `503`- oder `504`-Texte

---

### Requirement: Skalierbarkeit — parallele Request-Verarbeitung (NFA-04)
<!-- e2e: nfa-04-scalability.spec.ts -->

The system SHALL handle at least 3 concurrent HTTP requests to the website and to Keycloak's health endpoint without returning errors.

#### Scenario: Website und Keycloak verarbeiten 3 parallele Requests *(E2E)*
- **GIVEN** der Fleet-Cluster ist deployt; Keycloak-Health-Endpoint `/health/ready` ist aktiv
- **WHEN** 3 simultane GET-Requests auf Website-Root bzw. Keycloak-Health gesendet werden
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
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery-Endpoint (`/realms/workspace/.well-known/openid-configuration`), `/healthz` (Arena) gesendet werden; TLS-Handshake wird ohne `ignoreHTTPSErrors` durchgeführt
- **THEN** Website-Root und TLS-Handshake liefern Status < 500; OIDC-Discovery liefert 200 und `body.issuer` enthält `korczewski`; Arena `/healthz` liefert 200

---

### Requirement: System-weiter Service-Health-Sweep (NFA-INFRA)
<!-- e2e: nfa-infra-health-sweep.spec.ts -->

The system SHALL respond to HTTP health probes on all 17 workspace services (website, Keycloak, Nextcloud, Collabora, Vaultwarden, Mailpit, and others) with the expected status codes when PROD_DOMAIN is set.

#### Scenario: Alle Core-Services antworten auf HTTP-Health-Probes *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist auf `mentolder.de` (oder eine andere Produktivdomain) gesetzt; alle Services sind deployt
- **WHEN** GET-Requests auf `web.<domain>/`, `web.<domain>/api/health`, `auth.<domain>/realms/workspace/.well-known/openid-configuration`, `files.<domain>/status.php`, `office.<domain>/hosting/discovery`, `vault.<domain>/alive` und `mail.<domain>/` gesendet werden
- **THEN** Website liefert 200; `/api/health` liefert `{ok: true}`; OIDC-Discovery liefert 200 mit `issuer` und `authorization_endpoint`; Nextcloud liefert `installed: true`; Collabora liefert 200 mit XML/text Content-Type; Vaultwarden liefert 200; Mailpit liefert Status < 500

---

### Requirement: Multi-Brand Health und Realm-Isolation (SA-15)
<!-- e2e: sa-15-cross-cluster-health.spec.ts -->

The system SHALL serve both brands (mentolder and korczewski) independently from the unified fleet cluster, with each brand exposing its own Keycloak realm (issuer containing the brand name), valid TLS certificates, and brand-specific services (Arena on korczewski).

#### Scenario: mentolder Website, OIDC und Nextcloud auf Fleet *(E2E)*
- **GIVEN** `WEBSITE_URL` zeigt auf `https://web.mentolder.de`; Fleet-Cluster ist hochgefahren (prod-URLs aktiv)
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery (`auth.mentolder.de`) und Nextcloud (`files.mentolder.de/status.php`) gesendet werden; TLS-Handshake wird ohne `ignoreHTTPSErrors` durchgeführt
- **THEN** Website-Root liefert 200; OIDC-Discovery liefert 200 und `body.issuer` enthält `mentolder`; Nextcloud liefert `installed: true`; kein TLS-Zertifikatsfehler

#### Scenario: korczewski Website, OIDC, Brett und Arena auf Fleet — Realm-Isolation *(E2E)*
- **GIVEN** `KORCZEWSKI_URL` zeigt auf `https://web.korczewski.de`; korczewski-Brand ist auf Fleet deployt (korczewskiUp-Vorprüfung erfolgreich)
- **WHEN** GET-Requests auf Website-Root, OIDC-Discovery (`auth.korczewski.de`), Brett-Root und Arena `/healthz` gesendet werden; TLS-Handshake ohne `ignoreHTTPSErrors`
- **THEN** Website-Root liefert 200; OIDC-Discovery liefert 200 und `body.issuer` enthält `korczewski`; Brett-Root liefert Status < 500; Arena liefert 200; kein TLS-Zertifikatsfehler
- **AND** der korczewski-Issuer enthält NICHT `mentolder` (Realm-Isolation)

---

### Requirement: Integration Smoke — Vollständige Service-Erreichbarkeit
<!-- e2e: integration-smoke.spec.ts -->

The system SHALL pass smoke tests for Keycloak OIDC discovery (issuer, endpoints), Nextcloud (installed, not maintenance, no DB upgrade needed), Collabora (WOPI discovery XML), Nextcloud Talk signaling, Vaultwarden (/alive), and the Docs site (200/302/401 acceptable).

#### Scenario: Keycloak OIDC, Nextcloud, Collabora, Talk, Vaultwarden und Docs im Smoke-Test *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt; alle genannten Services sind deployt
- **WHEN** Smoke-Requests auf OIDC-Discovery, `files.<domain>/status.php`, `office.<domain>/hosting/discovery`, `signaling.<domain>/api/v1/welcome`, `vault.<domain>/alive` und `docs.<domain>/` gesendet werden
- **THEN** OIDC liefert `issuer` und `authorization_endpoint` mit Domainbezug; Nextcloud ist `installed: true`, `maintenance: false`, `needsDbUpgrade: false`; Collabora-Response enthält `wopi-discovery`; Talk antwortet mit 200 (503 gilt als fixme-bekannt); Vaultwarden ist erreichbar; Docs liefert 200, 302 oder 401

<!-- merged from change delta fleet-operations.md on 2026-06-30 -->