# workspace-deploy

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

`task workspace:deploy ENV=<env>` ist der einzige autorisierte Weg, den Workspace-Stack auf ein
Kubernetes-Cluster aufzuspielen. Der Befehl ist **push-basiert** — kein GitOps-Reconciler im
Cluster. Er kombiniert Schema-Validierung, SealedSecrets-Anwendung, Kustomize-Build mit
`envsubst`-Substitution und einen idempotenten `kubectl apply --server-side`. Für Prod werden
stets die `prod-fleet/<brand>/`-Overlays gebaut, nicht die `prod/`-Basis direkt. Dev nutzt den
`k3d/`-Basis-Build ohne Overlay.

---

### Requirement: Umgebungsvalidierung vor jedem Deploy

The system SHALL validate all required environment variables against `environments/schema.yaml`
before applying any Kubernetes manifest, and SHALL abort with a non-zero exit code if a required
variable is missing or fails its `validate` regex.

#### Scenario: Pflichtvar fehlt

- **GIVEN** `environments/mentolder.yaml` fehlt der Eintrag `PROD_DOMAIN`
- **WHEN** `task workspace:deploy ENV=mentolder` gestartet wird
- **THEN** schlägt `task env:validate` fehl, bevor ein einziges Manifest auf den Cluster angewendet wird
- **AND** der Operator erhält eine Fehlermeldung mit dem Namen der fehlenden Variable

#### Scenario: Alle Pflichtvar vorhanden

- **GIVEN** alle `required: true`-Variablen aus `schema.yaml` sind in der Env-Datei gesetzt und valide
- **WHEN** `task workspace:deploy ENV=mentolder` gestartet wird
- **THEN** besteht die Validierung und der Deploy fährt fort

---

### Requirement: SealedSecrets müssen vor den Workloads bereit sein

The system SHALL apply the environment's SealedSecret file (`environments/sealed-secrets/<env>.yaml`)
before deploying any workload manifest, and SHALL abort the deploy if the resulting
`workspace-secrets` Secret is not present in the target namespace within 90 seconds.

#### Scenario: SealedSecret erfolgreich entschlüsselt

- **GIVEN** `environments/sealed-secrets/mentolder.yaml` existiert und ist mit dem aktiven
  Sealed Secrets Controller-Keypair verschlüsselt
- **WHEN** das SealedSecret auf den Cluster angewendet wird
- **THEN** erzeugt der Controller innerhalb von 90 Sekunden das `workspace-secrets`-Secret
  im Namespace `workspace`
- **AND** der Deploy fährt mit dem Kustomize-Build fort

#### Scenario: SealedSecret nicht entschlüsselbar

- **GIVEN** der Sealed Secrets Controller wurde nach der letzten `env:seal`-Ausführung
  erneuert (neues Keypair)
- **WHEN** der Controller versucht, das alte SealedSecret zu entschlüsseln
- **THEN** bleibt `workspace-secrets` im Cluster aus
- **AND** `workspace:deploy` bricht nach dem 90-Sekunden-Timeout ab mit der Meldung
  "Aborting deploy: workspace-secrets is not present"
- **AND** kein Workload-Manifest wird angewendet

#### Scenario: SealedSecret-Datei fehlt komplett

- **GIVEN** `environments/sealed-secrets/mentolder.yaml` existiert nicht auf dem Dateisystem
- **WHEN** `task workspace:deploy ENV=mentolder` ausgeführt wird
- **THEN** wird der SealedSecrets-Block übersprungen (kein Fehler, `[[ -f "$sealed" ]]`-Guard)
- **AND** die nachfolgende 90s-Warteprüfung schlägt fehl, wenn `workspace-secrets` nicht
  bereits im Cluster vorhanden ist

---

### Requirement: Kustomize-Build mit Overlay-Trennung Prod vs. Dev

The system SHALL build the Kubernetes manifests using the Kustomize overlay referenced by
`ENV_OVERLAY` (from `environments/<env>.yaml`) for all non-dev environments, and SHALL use
the raw `k3d/` base directly for `ENV=dev`.

#### Scenario: Prod-Deploy nutzt Brand-Overlay

- **GIVEN** `environments/mentolder.yaml` enthält `overlay: prod-fleet/mentolder`
- **WHEN** `task workspace:deploy ENV=mentolder` den Kustomize-Build ausführt
- **THEN** wird `kustomize build prod-fleet/mentolder/` gebaut
- **AND** das Ergebnis enthält TLS-Konfiguration, wildcard-certificate, Traefik-Middlewares
  und die prod-spezifischen Realm/OIDC-ConfigMaps, nicht die dev-Platzhalter aus `k3d/`

#### Scenario: Dev-Deploy nutzt k3d-Basis ohne Overlay

- **GIVEN** `ENV=dev` (Standard wenn ENV nicht gesetzt)
- **WHEN** `task workspace:deploy` ausgeführt wird
- **THEN** wird `kustomize build k3d/` ohne Overlay gebaut
- **AND** das Ergebnis enthält Dev-Secrets aus `k3d/secrets.yaml` (nicht SealedSecrets)
- **AND** es werden keine TLS-Zertifikate oder Prod-Ingress-Regeln erstellt

---

### Requirement: Dev-Placeholder-Secrets werden in Prod-Overlays gelöscht

The system SHALL strip all dev placeholder Secrets (`workspace-secrets`, `knowledge-secrets`,
`backup-passphrase`, `vaultwarden-seed-credentials`) from the Kustomize output via
`$patch: delete` patches in `prod/kustomization.yaml` before applying to a production cluster,
so that a `workspace:deploy` can never overwrite SealedSecrets-managed credentials with
dev placeholder values.

#### Scenario: Deploy überschreibt keine Prod-Secrets

- **GIVEN** `workspace-secrets` im Cluster enthält rotierte Produktionspasswörter (via SealedSecrets)
- **WHEN** `task workspace:deploy ENV=mentolder` den Kustomize-Build auf den Cluster anwendet
- **THEN** werden die `$patch: delete`-Blöcke in `prod/kustomization.yaml` ausgewertet
- **AND** das `workspace-secrets`-Secret im Cluster behält seine Prod-Werte unverändert

#### Scenario: `$patch: delete`-Block wird entfernt (Footgun)

- **GIVEN** jemand entfernt den `$patch: delete workspace-secrets`-Block aus `prod/kustomization.yaml`
- **WHEN** der nächste `workspace:deploy` in Prod ausgeführt wird
- **THEN** schreibt der Deploy die Dev-Platzhalter aus `k3d/secrets.yaml` in das Prod-Secret
- **AND** alle Services, die auf Datenbankpasswörter aus `workspace-secrets` angewiesen sind,
  verlieren sofort die Datenbankverbindung

---

### Requirement: Envsubst-Substitution mit expliziter Variablenliste

The system SHALL substitute environment variables into Kustomize output using an explicit
allowlist (`ENVSUBST_VARS`) passed to `envsubst`, so that unintended `${VAR}` references in
manifests (shell-internal variables, script-local vars) are never accidentally expanded.

#### Scenario: Neue Var in Manifest, aber nicht in ENVSUBST_VARS

- **GIVEN** ein Manifest enthält `${NEW_VAR}` und `NEW_VAR` ist nicht in der `ENVSUBST_VARS`-Liste
  des `workspace:deploy`-Tasks
- **WHEN** `envsubst "$ENVSUBST_VARS"` ausgeführt wird
- **THEN** bleibt `${NEW_VAR}` als Literal im Manifest erhalten (kein unexpanded Platzhalter
  wird im Cluster appliziert, solange der K8s-API-Server ihn akzeptiert)

#### Scenario: MAIL_FROM_LOCAL/MAIL_FROM_DOMAIN Auto-Derivation

- **GIVEN** `SMTP_FROM` ist in der Env-Datei auf `mentolder@mailbox.org` gesetzt
- **WHEN** `workspace:deploy ENV=mentolder` die Substitution vorbereitet
- **THEN** werden `MAIL_FROM_LOCAL=mentolder` und `MAIL_FROM_DOMAIN=mailbox.org` automatisch
  aus `SMTP_FROM` abgeleitet
- **AND** Nextcloud verwendet diese Werte als `MAIL_FROM_ADDRESS` und `MAIL_DOMAIN`,
  sodass der Absender mit dem SMTP-Auth-Account übereinstimmt

---

### Requirement: Shared-DB muss vor abhängigen Services bereit sein

The system SHALL deploy and wait for the `shared-db` Deployment to reach a ready state
(rollout status, timeout 120s) before applying the remaining workspace manifests, to prevent
crash-loops in Keycloak, Nextcloud, Vaultwarden, and other database-dependent services.

#### Scenario: Erstmaliger Cluster-Start

- **GIVEN** der Namespace `workspace` existiert, aber `shared-db` wurde noch nie gestartet
- **WHEN** `workspace:deploy` den `shared-db.yaml`-Bootstrap anwendet
- **THEN** wartet der Task bis zu 120 Sekunden auf `deployment/shared-db` rollout status
- **AND** erst nach erfolgreichem Rollout werden alle weiteren Manifests angewendet

#### Scenario: Shared-DB startet nicht in 120 Sekunden

- **GIVEN** das `shared-db`-Image kann nicht gepullt werden (z.B. Registry nicht erreichbar)
- **WHEN** `kubectl rollout status deployment/shared-db --timeout=120s` läuft
- **THEN** schlägt der Befehl nach 120 Sekunden mit Fehler fehl
- **AND** der Gesamtdeploy bricht ab, ohne abhängige Services in einen fehlerhaften Zustand zu bringen

---

### Requirement: Namespace-Awareness für Multi-Brand-Cluster

The system SHALL deploy all workspace resources into the namespace defined by
`WORKSPACE_NAMESPACE` (from the env file), defaulting to `workspace`, so that both brands
(`mentolder` → `workspace`, `korczewski` → `workspace-korczewski`) can coexist on the same
fleet cluster without cross-contaminating resources.

#### Scenario: Korczewski-Deploy in eigenem Namespace

- **GIVEN** `environments/korczewski.yaml` setzt `WORKSPACE_NAMESPACE: workspace-korczewski`
- **WHEN** `task workspace:deploy ENV=korczewski` ausgeführt wird
- **THEN** werden alle Ressourcen im Namespace `workspace-korczewski` erstellt (nicht in `workspace`)
- **AND** `workspace:post-setup`-Subkommandos (Nextcloud-OCC, DB-Sync) verwenden ebenfalls
  `workspace-korczewski` als Ziel-Namespace

#### Scenario: Post-Config-Aufruf ohne explizites WORKSPACE_NAMESPACE

- **GIVEN** ein neues Taskfile-Target führt `kubectl -n workspace` hartcodiert aus
- **WHEN** der Task für `ENV=korczewski` ausgeführt wird
- **THEN** landet die Konfiguration im falschen Namespace (`workspace` statt `workspace-korczewski`)
- **AND** die korczewski-Services erhalten die Konfiguration nicht (Silent Failure)

---

### Requirement: Automatische Nachbehandlung nach Prod-Deploy

The system SHALL, after a successful prod manifest apply, automatically run `keycloak:sync`,
`workspace:sync-db-passwords`, and `workspace:coturn:sync-secret` + `workspace:talk-setup`
(unless `SKIP_TALK_SETUP=true`), so that Keycloak realm, database passwords, and Nextcloud
Talk signaling config are always in sync with the current `workspace-secrets` Secret.

#### Scenario: Rotierte DB-Passwörter nach env:seal

- **GIVEN** ein neues SealedSecret mit geändertem `SHARED_DB_PASSWORD` wurde deployt
- **WHEN** `task workspace:deploy ENV=mentolder` die Post-Deploy-Kette ausführt
- **THEN** führt `workspace:sync-db-passwords` die `ALTER ROLE`-Statements in PostgreSQL aus
- **AND** alle Deployments werden per `rollout restart` mit den neuen Credentials ausgestattet

#### Scenario: LiveKit DNS-Pinning auf mentolder

- **GIVEN** `ENV=mentolder` und `livekit-server` ist per `nodeAffinity` auf `pk-hetzner-4` gepinnt
- **WHEN** `workspace:deploy` nach dem Kustomize-Apply abgeschlossen hat
- **THEN** wird `task livekit:dns-pin ENV=mentolder APPLY=true` aufgerufen
- **AND** `livekit.<domain>` und `stream.<domain>` zeigen via ipv64-API auf `204.168.244.104`
- **AND** Browser-Clients landen zuverlässig auf dem LiveKit-Node ohne Cross-Node-Routing
