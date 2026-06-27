# workspace-deploy

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

`task workspace:deploy ENV=<env>` ist der einzige autorisierte Weg, den Workspace-Stack auf ein
Kubernetes-Cluster aufzuspielen. Der Befehl ist **push-basiert** — kein GitOps-Reconciler im
Cluster. Er kombiniert Schema-Validierung, SealedSecrets-Anwendung, Kustomize-Build mit
`envsubst`-Substitution und einen idempotenten `kubectl apply --server-side`. Für Prod werden
stets die `prod-fleet/<brand>/`-Overlays gebaut, nicht die `prod/`-Basis direkt. Dev nutzt den
`k3d/`-Basis-Build ohne Overlay.

---

## Requirements

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

---

### Requirement: Env-Resolver unterstützt mehrzeilige YAML-Werte

The system SHALL parse multi-line YAML values (YAML block scalars and folded continuation
lines) in `environments/<env>.yaml` correctly, preserving the full string without truncation,
so that long secrets such as `STRIPE_PUBLISHABLE_KEY` retain all characters after sourcing
`env-resolve.sh`.

#### Scenario: Langer API-Key mit YAML-Zeilenfortsetzung

- **GIVEN** `environments/prod.yaml` enthält `STRIPE_PUBLISHABLE_KEY` als 107-Zeichen-Wert
  mit einer YAML-Backslash-Zeilenfortsetzung
- **WHEN** `source scripts/env-resolve.sh prod` ausgeführt wird
- **THEN** exportiert `$STRIPE_PUBLISHABLE_KEY` exakt 107 Zeichen (kein Truncation nach 55)
- **AND** der vollständige Wert beginnt mit `pk_live_51RhKrcDG...`

#### Scenario: Convenience-Variablen aus Top-Level-Keys

- **GIVEN** `environments/prod.yaml` enthält `context: fleet`, `domain: example.test`,
  `overlay: prod-fleet/mentolder`
- **WHEN** `source scripts/env-resolve.sh prod` ausgeführt wird
- **THEN** exportiert der Resolver `ENV_CONTEXT=fleet`, `ENV_DOMAIN=example.test`,
  `ENV_OVERLAY=prod-fleet/mentolder` als separate Variablen
- **AND** `KC_USER1_USERNAME` und andere `setup_vars` werden ebenfalls exportiert

---

### Requirement: Dev-Fallback-Werte aus Schema gelten nur für ENV=dev

The system SHALL apply `default_dev` values from `environments/schema.yaml` only when
`ENV=dev`, and SHALL leave variables unset (not substituted with dev defaults) for all
non-dev environments, preventing accidental dev-value injection into staging or prod
deployments.

#### Scenario: Dev-Fallback greift für fehlende Variable

- **GIVEN** `schema.yaml` definiert `MISSING_IN_ENV` mit `default_dev: "dev-fallback"` und
  `environments/dev.yaml` enthält keinen Eintrag für `MISSING_IN_ENV`
- **WHEN** `source scripts/env-resolve.sh dev` ausgeführt wird
- **THEN** exportiert `$MISSING_IN_ENV=dev-fallback` (aus dem Schema-Default)

#### Scenario: Prod-Env ignoriert Dev-Fallback

- **GIVEN** `schema.yaml` definiert `MISSING_IN_ENV` mit `default_dev: "dev-fallback"` und
  `environments/prod.yaml` enthält keinen Eintrag für `MISSING_IN_ENV`
- **WHEN** `source scripts/env-resolve.sh prod` ausgeführt wird
- **THEN** bleibt `$MISSING_IN_ENV` ungesetzt (`<unset>`) — kein Dev-Default wird angewendet

---

### Requirement: Env-Resolver validiert Aufruf-Argumente

The system SHALL exit non-zero with a usage message when `env-resolve.sh` is called without
an environment name, and SHALL exit non-zero with "Environment file not found" when the named
environment file does not exist in the env directory.

#### Scenario: Fehlender Env-Name

- **GIVEN** `env-resolve.sh` wird ohne Argumente oder mit leerem ersten Argument aufgerufen
- **WHEN** `source scripts/env-resolve.sh '' "$ENV_DIR"` ausgeführt wird
- **THEN** schlägt der Aufruf mit Exit-Code != 0 fehl
- **AND** die Ausgabe enthält `Usage:`

#### Scenario: Nicht-existierende Env-Datei

- **GIVEN** `environments/does-not-exist.yaml` existiert nicht auf dem Dateisystem
- **WHEN** `source scripts/env-resolve.sh does-not-exist` ausgeführt wird
- **THEN** schlägt der Aufruf mit Exit-Code != 0 fehl
- **AND** die Ausgabe enthält `Environment file not found`

---

### Requirement: Env-Validierung erkennt Regex-Fehler und Platzhalter

The system SHALL reject environment variable values that fail their `validate` regex from
`schema.yaml`, and SHALL reject values matching known placeholder patterns
(`yourdomain.tld`, `MANAGED_EXTERNALLY`, `not-configured`, `*_placeholder`, etc.) with a
non-zero exit code and a message naming the offending variable.

#### Scenario: Regex-Verstoß bei PROD_DOMAIN

- **GIVEN** `environments/bad-regex.yaml` setzt `PROD_DOMAIN: "INVALID DOMAIN!"` (enthält
  Leerzeichen und Ausrufezeichen, verstößt gegen `^[a-z0-9.-]+$`)
- **WHEN** `bash scripts/env-validate.sh --env bad-regex --schema-only` ausgeführt wird
- **THEN** schlägt die Validierung fehl
- **AND** die Ausgabe enthält den Namen der fehlerhaften Variable `PROD_DOMAIN`

#### Scenario: Platzhalter-Domain wird abgelehnt

- **GIVEN** `environments/placeholder.yaml` enthält Werte wie `yourdomain.tld`
- **WHEN** `bash scripts/env-validate.sh --env placeholder --schema-only` ausgeführt wird
- **THEN** schlägt die Validierung fehl
- **AND** die Ausgabe enthält `yourdomain.tld` als Hinweis auf den unverstetzten Platzhalter

---

### Requirement: Env-Validierung prüft SealedSecret-Vollständigkeit

The system SHALL verify that the SealedSecret file referenced by `secrets_ref` in the
environment YAML exists on disk and contains encrypted data entries for every secret marked
`required: true` in `schema.yaml`, aborting validation with a named-key error if either
condition is violated.

#### Scenario: SealedSecret-Datei fehlt

- **GIVEN** `environments/no-sealed.yaml` verweist auf `sealed-secrets/nonexistent.yaml`,
  die nicht existiert
- **WHEN** `bash scripts/env-validate.sh --env no-sealed --schema-only` ausgeführt wird
- **THEN** schlägt die Validierung fehl
- **AND** die Ausgabe enthält den Pfad `sealed-secrets/nonexistent.yaml`

#### Scenario: SealedSecret fehlt Pflicht-Key

- **GIVEN** `sealed-secrets/partial.yaml` enthält `SHARED_DB_PASSWORD` aber nicht
  `KEYCLOAK_ADMIN_PASSWORD` (das in `schema.yaml` als `required: true` markiert ist)
- **WHEN** `bash scripts/env-validate.sh --env partial-sealed --schema-only` ausgeführt wird
- **THEN** schlägt die Validierung fehl
- **AND** die Ausgabe nennt `KEYCLOAK_ADMIN_PASSWORD` als fehlenden Key

---

### Requirement: Env-Validierung unterstützt Drift-Erkennung über alle Envs

The system SHALL support a `--drift` mode that checks all environments in the env directory
against the schema in a single pass, exiting zero when all envs are consistent with each
other and the schema.

#### Scenario: Konsistente Envs bestehen Drift-Check

- **GIVEN** `environments/` enthält `dev.yaml` und `prod.yaml`, beide konsistent mit
  `schema.yaml`
- **WHEN** `bash scripts/env-validate.sh --drift --schema-only` ausgeführt wird
- **THEN** besteht der Drift-Check ohne Fehler (Exit 0)

---

### Requirement: Kustomize-Basis enthält alle erwarteten Core-Ressourcen

The system SHALL produce a Kustomize build (`kubectl kustomize k3d/`) that contains
Deployments for `keycloak`, `nextcloud`, `shared-db`, `collabora`, `vaultwarden`, and
`mailpit`, at least one Ingress resource, a `domain-config` ConfigMap, a `realm-template`
ConfigMap, a `nextcloud-oidc-config` ConfigMap, and Pod Security Standards labels on the
`workspace` Namespace.

#### Scenario: Vollständiger Basis-Build

- **GIVEN** `k3d/kustomization.yaml` referenziert alle Core-Manifests und `k3d/secrets.yaml`
  existiert mit dev-Platzhaltern
- **WHEN** `kubectl kustomize k3d/` ausgeführt wird
- **THEN** enthält das Ergebnis Deployments `keycloak`, `nextcloud`, `shared-db`,
  `vaultwarden`, `mailpit`, `collabora` sowie Ingress-Regeln für `auth.*`, `files.*`,
  `office.*`, `vault.*`, `mail.*`
- **AND** das `workspace`-Namespace-Objekt trägt `pod-security.kubernetes.io`-Labels

#### Scenario: Alle kustomization.yaml-Ressourcen existieren als Dateien

- **GIVEN** `k3d/kustomization.yaml` listet eine Menge von `resources:` auf
- **WHEN** jeder Eintrag gegen das Dateisystem geprüft wird
- **THEN** existiert jede referenzierte Datei oder jedes Verzeichnis unter `k3d/`
  (Ausnahme: `secrets.yaml` ist gitignoriert und gilt als bekanntes generiertes Artefakt)

---

### Requirement: Image-Pinning-Regeln für Core-Services

The system SHALL ensure that no core service container image uses the `:latest` tag, that
all images carry either an explicit version tag or a digest, and that MCP sidecar images,
internal build images (`paddione/bachelorprojekt`, `workspace-brett`, `docs`, `videovault`,
`mediaviewer-widget`) are exempt from the `:latest` prohibition.

#### Scenario: Core-Images ohne :latest

- **GIVEN** die gerenderten Manifests aus `kubectl kustomize k3d/`
- **WHEN** alle `image:`-Felder ausgelesen werden
- **THEN** enthält kein Core-Service-Image das Tag `:latest`
- **AND** jedes Image-Feld enthält entweder `:` (Versions-Tag) oder `@` (Digest)

#### Scenario: :latest bei internen Build-Images erlaubt

- **GIVEN** `k3d/website.yaml`, `k3d/brett.yaml`, `k3d/docs.yaml` u.a. nutzen `:latest`
  für intern gebaute Images (`paddione/bachelorprojekt*`, `workspace-brett`, `docs`, etc.)
- **WHEN** der Image-Pinning-Check ausgeführt wird
- **THEN** werden diese Images von der `:latest`-Prüfung ausgenommen
- **AND** der Check schlägt nur fehl, wenn ein Drittanbieter-Core-Image `:latest` trägt

---

### Requirement: Namespace-Konsistenz im Basis-Build

The system SHALL ensure that all namespaced resources in `kubectl kustomize k3d/` target
either the `workspace` namespace, `kube-system`, or the `website` namespace — no resource
SHALL reference any other namespace in its `metadata.namespace` field.

#### Scenario: Keine unerwarteten Namespace-Referenzen

- **GIVEN** der vollständige Kustomize-Basis-Build von `k3d/`
- **WHEN** alle `namespace:`-Felder im Output ausgelesen werden
- **THEN** sind ausschließlich `workspace`, `kube-system` und `website` als Werte vorhanden
- **AND** kein Manifest referenziert einen nicht deklarierten oder projektfremden Namespace

---

### Requirement: pvc-backup-CronJob schlägt bei Upload-Fehler laut fehl

The system SHALL configure the `pvc-backup` CronJob so that a failed Filen upload causes
the container to exit with code 1 (not emit a WARNING and continue), ensuring that
`lastSuccessfulTime` accurately reflects whether backups were actually uploaded.

#### Scenario: Upload-Fehler löst Exit 1 aus

- **GIVEN** `k3d/pvc-backup-cronjob.yaml` enthält das Orchestrator-Skript
- **WHEN** der Filen-Upload fehlschlägt
- **THEN** beendet das Skript den Container mit Exit-Code 1 (nicht mit `echo WARNING: ...`)
- **AND** das YAML enthält keinen String `WARNING: Filen upload failed`

---

### Requirement: pvc-backup leitet Namespace zur Laufzeit aus dem Pod ab

The system SHALL derive the target namespace in the `pvc-backup` CronJob orchestrator
script at runtime from the pod's ServiceAccount token
(`/var/run/secrets/kubernetes.io/serviceaccount/namespace`), not from a hardcoded
`NS=workspace` literal, so that Kustomize namespace-remapping for the korczewski brand
(`workspace-korczewski`) takes effect without modifying container arguments.

#### Scenario: Kein hartcodierter `NS=workspace`

- **GIVEN** `k3d/pvc-backup-cronjob.yaml` enthält das Orchestrator-Skript
- **WHEN** das Skript nach `NS=workspace` (mit Zeilenende) gesucht wird
- **THEN** ist diese Zeile nicht vorhanden (grep schlägt fehl)
- **AND** das Skript liest den Namespace aus
  `/var/run/secrets/kubernetes.io/serviceaccount/namespace`

#### Scenario: pvc-backup verwendet keine Affinity zu dekkomissionierten Nodes

- **GIVEN** `k3d/pvc-backup-cronjob.yaml` enthält eine `nodeAffinity`-Konfiguration für den Mounter
- **WHEN** das YAML nach Node-Namen früherer Cluster (`k3s-1`, `k3s-2`, `k3w-1`, etc.)
  durchsucht wird (Kommentare ausgenommen)
- **THEN** enthält das YAML keine solchen Node-Namen in aktiven Konfigurationsfeldern

---

### Requirement: pvc-backup klont Longhorn-PVCs bedingt nach StorageClass

The system SHALL gate Longhorn CSI clone creation in the `pvc-backup` orchestrator on the
actual `storageClassName` of each data PVC, cloning only PVCs backed by `longhorn` and
falling back to live-tar for `local-path`-backed PVCs, so that the CronJob succeeds on
both brands regardless of storage driver availability.

#### Scenario: Clone-Gate per StorageClass

- **GIVEN** `k3d/pvc-backup-cronjob.yaml` enthält den Orchestrator-Code
- **WHEN** das Skript nach PVC-StorageClass-Prüfung für `vaultwarden-data-pvc` sucht
- **THEN** enthält es `get pvc vaultwarden-data-pvc -o jsonpath=.*storageClassName`
- **AND** die Clone-Logik ist durch `[ "$VW_SC" = "longhorn" ]` bedingt

#### Scenario: Kein unbedingtes Clone-Assignment

- **GIVEN** der frühere Bug hat `CLONES="vaultwarden-data-backup-clone"` statisch gesetzt
- **WHEN** das YAML nach diesem statischen String durchsucht wird (Kommentare ausgenommen)
- **THEN** ist dieser String nicht vorhanden (Clone-Zuweisung ist dynamisch/bedingt)

---

### Requirement: Prod-Overlays rendern keine Split-MCP-Pods

The system SHALL ensure that prod kustomize overlays (`prod-*` and `prod-fleet/<brand>`)
do not render Deployment or Service resources named `claude-code-mcp-ops`,
`claude-code-mcp-auth`, `mcp-browser`, or `mcp-github`, as production serves all MCP via
the `claude-code-mcp-monolith` Deployment.

#### Scenario: Split-MCP-Ressourcen nicht in Prod

- **GIVEN** alle Prod-Overlays unter `prod-*/` und `prod-fleet/*/`
- **WHEN** jeder Overlay per `kubectl kustomize` gerendert und nach den vier Split-MCP-Namen
  gesucht wird
- **THEN** enthält kein Prod-Overlay-Render ein Deployment oder Service mit diesen Namen
- **AND** die Test-Ausgabe lautet `OK: prod overlays render no split MCP ops/auth/browser/github resources`

---

### Requirement: workspace-secrets-Secret enthält keine Klardaten in Prod-Overlays

The system SHALL ensure that no prod kustomize overlay renders a `workspace-secrets` Secret
resource with `stringData` or `data` fields populated, as production credentials are managed
exclusively via SealedSecrets.

#### Scenario: workspace-secrets ohne Klardaten in allen Prod-Overlays

- **GIVEN** alle Kustomize-Overlays in `prod*/` und `prod-fleet/*/`
- **WHEN** jeder Overlay gerendert und nach einem `Secret` mit `name: workspace-secrets`
  und befüllten `data`/`stringData`-Feldern gesucht wird
- **THEN** enthält kein Overlay ein solches Secret mit Klardaten
- **AND** die Test-Ausgabe lautet `OK: no workspace-secrets Secret in prod overlays`

---

### Requirement: billing-dunning-detection CronJob zielt auf den Website-Namespace

The system SHALL configure the `billing-dunning-detection` CronJob so that its curl command
targets `website.<website-namespace>.svc` (not `website.workspace.svc.cluster.local`), as
the website Deployment lives in its own namespace (`website` / `website-korczewski`) and
not in `workspace`.

#### Scenario: Kein workspace-ns-Ziel im Dunning-CronJob

- **GIVEN** alle Prod-Overlays unter `prod-*/` und `prod-fleet/*/`
- **WHEN** der `billing-dunning-detection`-CronJob gerendert und das `command`-Feld des
  Containers geprüft wird
- **THEN** enthält kein Command den String `website.workspace.svc`
- **AND** die Test-Ausgabe lautet `OK: dunning CronJob targets the website namespace in all prod overlays`

---

### Requirement: NetworkPolicies erlauben Egress zum Kubernetes-API-Server

The system SHALL define NetworkPolicies in the `k3d/` base that grant egress from the
`workspace` namespace to both the Kubernetes API ClusterIP range (`10.43.0.0/16` port 443)
and the CP node IP range (`10.20.0.0/24` port 6443), so that CronJobs running `kubectl`
in-cluster (pvc-backup, tests-results-retention) can reach the API server after kube-router
evaluates post-DNAT endpoints.

#### Scenario: API-Server-Egress-Policies vorhanden

- **GIVEN** der gerenderte Basis-Build aus `kubectl kustomize k3d/`
- **WHEN** die NetworkPolicy-Ressourcen nach Egress-Rules für `10.20.0.0/24:6443` und
  `10.43.0.0/16:443` durchsucht werden
- **THEN** existiert mindestens eine Policy, die `10.20.0.0/24` auf Port 6443 freigibt
- **AND** mindestens eine Policy gibt `10.43.0.0/16` auf Port 443 frei

---

### Requirement: Website-Overlay erlaubt Egress zum workspace-office-Namespace

The system SHALL include a NetworkPolicy in the `prod-fleet/website-mentolder` overlay that
grants egress from the website namespace to the `workspace-office` namespace (port
`matchLabels: kubernetes.io/metadata.name: workspace-office`), enabling the Platform Hub
health probe for Collabora to succeed.

#### Scenario: Egress-Policy zu workspace-office vorhanden

- **GIVEN** der gerenderte `prod-fleet/website-mentolder`-Overlay
- **WHEN** die NetworkPolicies nach einer Egress-Rule mit
  `namespaceSelector.matchLabels["kubernetes.io/metadata.name"] = "workspace-office"`
  durchsucht werden
- **THEN** existiert mindestens eine solche NetworkPolicy mit `policyTypes: [Egress]`
- **AND** die Test-Ausgabe lautet `OK`

---

### Requirement: Staging-ID-Skript normalisiert Branch-Namen deterministisch

The system SHALL normalize arbitrary git branch names into a DNS-safe staging identifier:
lowercase alphanumeric characters and hyphens only, at most 20 characters, starting with
a letter (digits prefixed with `s-`), with `refs/heads/` stripped, slashes and underscores
replaced by hyphens, and consecutive separators collapsed to a single hyphen.

#### Scenario: Feature-Branch-Normalisierung

- **GIVEN** ein Branch-Name `feature/T000616-staging-on-demand`
- **WHEN** `bash scripts/staging-id.sh "feature/T000616-staging-on-demand"` ausgeführt wird
- **THEN** ist das Ergebnis ein String aus `[a-z0-9-]` mit maximal 20 Zeichen
- **AND** derselbe Input liefert immer dasselbe Ergebnis (deterministisch)

#### Scenario: Sonderfälle werden korrekt behandelt

- **GIVEN** Branch-Name `refs/heads/feature/abc` (mit `refs/heads/`-Prefix)
- **WHEN** `bash scripts/staging-id.sh` aufgerufen wird
- **THEN** ist das Ergebnis `feature-abc` (Prefix entfernt, Slash zu Bindestrich)
- **AND** ein Branch-Name, der mit einer Ziffer beginnt (`123-feature`), erhält ein
  Buchstaben-Prefix (z.B. `s-`), sodass der ID mit einem Buchstaben beginnt

---

### Requirement: Staging-Stack-Kustomize-Build akzeptiert Platzhalter-Variablen

The system SHALL produce a valid Kustomize build of `k3d/staging-stack/` when
`STAGING_NS`, `STAGING_ID`, and `STAGING_IMAGE` are provided via `envsubst`, and the
rendered output SHALL contain a Namespace, StatefulSet, Deployment, Ingress, and Job
resource.

#### Scenario: Staging-Build mit Platzhaltern

- **GIVEN** `STAGING_NS=workspace-staging-test`, `STAGING_ID=test`,
  `STAGING_IMAGE=ghcr.io/paddione/workspace-website:staging-test`
- **WHEN** `kubectl kustomize k3d/staging-stack/ | envsubst ...` ausgeführt wird
- **THEN** enthält der Output `workspace-staging-test` als Namespace-Name
- **AND** der Output enthält die Image-Referenz
  `ghcr.io/paddione/workspace-website:staging-test`
- **AND** der Output enthält `kind: Namespace`, `kind: StatefulSet`, `kind: Deployment`,
  `kind: Ingress` und `kind: Job`

---

### Requirement: changed-manifests.sh erkennt Manifest-Änderungen korrekt

The system SHALL detect changes in `k3d/`, `prod-fleet/`, `prod-mentolder/`,
`prod-korczewski/`, `prod/`, and `environments/` directories as manifest changes (exit 0),
and SHALL treat changes exclusively in `docs/` or `website/` as non-manifest changes
(exit 1 with "no manifest changes").

#### Scenario: Manifest-Änderung wird erkannt

- **GIVEN** ein Git-Commit ändert eine Datei unter `k3d/`, `prod-fleet/` oder `environments/`
- **WHEN** `bash scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** gibt das Skript den geänderten Dateinamen aus und beendet sich mit Exit 0

#### Scenario: Nur Docs/Website-Änderungen führen zu Exit 1

- **GIVEN** ein Git-Commit ändert ausschließlich Dateien unter `docs/` oder `website/src/`
- **WHEN** `bash scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** beendet sich das Skript mit Exit 1
- **AND** die Ausgabe enthält `no manifest changes`

---

### Requirement: changed-manifests.sh verwendet HEAD~1 HEAD als Standard-Argumente

The system SHALL default to comparing `HEAD~1` against `HEAD` when no arguments are passed
to `scripts/changed-manifests.sh`, so that the script is usable without explicit ref
arguments in post-commit hooks and CI steps.

#### Scenario: Keine Argumente — Standard-Refs

- **GIVEN** der letzte Git-Commit enthält eine Datei unter `k3d/`
- **WHEN** `bash scripts/changed-manifests.sh` ohne Argumente ausgeführt wird
- **THEN** erkennt das Skript die Manifest-Änderung und beendet sich mit Exit 0

---

### Requirement: render-cloud-init.sh substituiert Versionen und Parameter aus Fixtures

The system SHALL render a cloud-init YAML template by substituting `NODE_IP`, `K3S_VERSION`
(from `versions.yaml`), `K3S_URL`, and `SSH_PUBLIC_KEY` from CLI flags, producing a
`#cloud-config`-prefixed output, and SHALL fail with a descriptive error message if
required flags (`--node-ip`, `--versions-file`, `--template`) are missing or their files
do not exist.

#### Scenario: Alle Variablen werden korrekt ersetzt

- **GIVEN** ein minimales `versions.yaml` mit `k3s: v9.99.0+k3s1` und ein Template mit
  `${NODE_IP}`, `${K3S_VERSION}`, `${K3S_URL}`, `${SSH_PUBLIC_KEY}`
- **WHEN** `bash scripts/hetzner/render-cloud-init.sh --node-ip 1.2.3.4 ...` ausgeführt wird
- **THEN** enthält der Output `NODE_IP=1.2.3.4`, `K3S_VERSION=v9.99.0+k3s1`,
  `K3S_URL=https://192.168.100.1:6443` und den SSH-Public-Key
- **AND** der Output beginnt mit `#cloud-config`

#### Scenario: Pflichtparameter fehlt → Fehler

- **GIVEN** `--node-ip` wird nicht übergeben oder `--versions-file` zeigt auf eine
  nicht-existierende Datei
- **WHEN** `bash scripts/hetzner/render-cloud-init.sh ...` ausgeführt wird
- **THEN** schlägt das Skript mit Exit-Code != 0 fehl
- **AND** die Fehlermeldung nennt das fehlende Argument (`node-ip`, `versions file`,
  `template`)

---

### Requirement: discover-versions.sh ermittelt Tool-Versionen ohne Flux

The system SHALL discover current versions for k3s, sealed-secrets Helm chart,
cert-manager, and longhorn Helm chart via GitHub API and Helm search, write them to
`versions.yaml` when `--update` is passed, and SHALL NOT track or write a `flux:` key
(fleet is push-based, no Flux controller installed).

#### Scenario: Dry-Run gibt alle Versionen aus

- **GIVEN** gemockte `curl`- und `helm`-Befehle liefern fixture-Werte
- **WHEN** `bash scripts/discover-versions.sh` ohne `--update` ausgeführt wird
- **THEN** enthält der Output `k3s: v1.99.0+k3s1`, `sealed_secrets_chart: 9.1.0`,
  `cert_manager: v9.2.0`, `longhorn_chart: 9.3.0`
- **AND** der Output enthält keinen Eintrag für `flux:` (da kein GitOps-Controller)
- **AND** keine `versions.yaml`-Datei wird geschrieben

#### Scenario: --update schreibt versions.yaml mit managed-by-Kommentar

- **GIVEN** `--update --versions-file <path>` werden übergeben
- **WHEN** `bash scripts/discover-versions.sh --update` ausgeführt wird
- **THEN** existiert die Datei und enthält alle vier Pflicht-Keys (`k3s:`, `sealed_secrets_chart:`,
  `cert_manager:`, `longhorn_chart:`)
- **AND** die erste Zeile der Datei enthält `discover-versions.sh` (managed-by-Kommentar)
- **AND** `flux:` ist nicht in der Datei vorhanden

---

### Requirement: Website-Dockerfile setzt Node.js-Heap-Limit im Build-Stage

The system SHALL set `NODE_OPTIONS` with `--max-old-space-size` of at least 2048 MB in the
build stage of `website/Dockerfile` (before the runtime `FROM` line), preventing OOM
crashes and SIGSEGV during the memory-hungry Astro + pixi.js build on constrained hosts.

#### Scenario: Heap-Limit vorhanden und ausreichend

- **GIVEN** `website/Dockerfile` enthält einen Build-Stage-Block und einen Runtime-Stage-Block
- **WHEN** das Dockerfile nach `NODE_OPTIONS.*max-old-space-size` durchsucht wird
- **THEN** ist das Flag vorhanden und der numerische Wert ist >= 2048 (MB)
- **AND** die `NODE_OPTIONS`-Zeile liegt im Build-Stage (Zeilennummer kleiner als die
  Runtime-Stage-FROM-Zeile)

---

### Requirement: Dev-Cluster-Autostart-Unit startet Cluster, erstellt ihn nie neu

The system SHALL provide a `scripts/dev-cluster-autostart.sh` installer that creates a
systemd oneshot unit with `ExecStart` using `k3d cluster start` (never `k3d cluster
create`), ordered after and requiring `docker.service`, marked `RemainAfterExit=true`,
wired into `multi-user.target`, and installable idempotently via `systemctl enable --now`.

#### Scenario: Unit startet Cluster und verliert keine Port-Mappings

- **GIVEN** `scripts/dev-cluster-autostart.sh` existiert und besteht den Bash-Syntax-Check
- **WHEN** das Skript nach `ExecStart` und `cluster create` durchsucht wird
- **THEN** enthält es `ExecStart=.*cluster start` (nicht `create`)
- **AND** enthält es `Type=oneshot`, `RemainAfterExit=true` und `WantedBy=multi-user.target`

#### Scenario: Idempotente Installation und Docker-Abhängigkeit

- **GIVEN** das Autostart-Skript
- **WHEN** es nach `systemctl enable --now` und `After|Requires=docker.service` durchsucht wird
- **THEN** sind beide Muster vorhanden, sodass Neuinstallationen idempotent sind und Docker
  vor dem Cluster-Start bereit ist

---

### Requirement: Task-Oracle führt strukturierte Eingaben direkt ohne LLM aus

The system SHALL recognize structured task inputs of the form `<namespace>:<action>` (with
optional `ENV=<value>`) as a fast-path, execute the corresponding `task` command directly
(bypassing Hermes/OpenClaw LLM routing), and emit a `[fast-path]` tag on stderr. For
`ENV=both`, it SHALL use the `all-prods` sibling task if it exists, or run sequentially for
mentolder and korczewski if it does not. Unknown task names SHALL exit 1 with an "Unknown
task" error, and natural-language inputs SHALL NOT trigger the fast-path.

#### Scenario: Strukturierter Input mit ENV wird direkt ausgeführt

- **GIVEN** die `task`-Binäry ist verfügbar und kennt `workspace:deploy`
- **WHEN** `bash scripts/task-oracle.sh "workspace:deploy ENV=mentolder"` ausgeführt wird
- **THEN** wird `task workspace:deploy ENV=mentolder` aufgerufen (Exit 0)
- **AND** stderr enthält `[fast-path]`

#### Scenario: ENV=both mit all-prods-Sibling und ohne

- **GIVEN** `feature:website:all-prods` existiert als Task
- **WHEN** `bash scripts/task-oracle.sh "feature:website ENV=both"` ausgeführt wird
- **THEN** wird `feature:website:all-prods` aufgerufen (nicht zweimal sequenziell)
- **AND** für `workspace:deploy ENV=both` (kein `all-prods`-Sibling) werden nacheinander
  `workspace:deploy ENV=mentolder` und `workspace:deploy ENV=korczewski` aufgerufen

---

### Requirement: env-seal.sh lehnt Dev-Platzhalter in Secrets-Dateien ab

The system SHALL reject any secrets file (via `--_test-dev-scan`) that contains values
matching known placeholder patterns (`dev*`, `*_placeholder`, `not-configured`,
`MANAGED_EXTERNALLY`, empty strings for required secrets) with a non-zero exit code naming
the offending key, and SHALL allow the bypass only with `--force` (which emits a WARNING).
Optional (`required: false`) secrets MAY have empty values.

#### Scenario: Dev-Präfix und Platzhalter-Suffixe werden abgelehnt

- **GIVEN** `mysecrets.yaml` enthält `KEYCLOAK_DB_PASSWORD: "devkeycloakdb"` oder
  `GITHUB_PAT: "ghp_dev_placeholder"` oder `STRIPE_SECRET_KEY: "sk_test_placeholder"`
- **WHEN** `bash scripts/env-seal.sh --_test-dev-scan mysecrets.yaml` ausgeführt wird
- **THEN** schlägt der Check fehl (Exit != 0)
- **AND** die Ausgabe nennt die Schlüssel-Namen und `dev placeholder`

#### Scenario: --force überspringt Check mit Warnung; required:false darf leer sein

- **GIVEN** `mysecrets.yaml` enthält `KEYCLOAK_DB_PASSWORD: "devkeycloakdb"`
- **WHEN** `--force` übergeben wird
- **THEN** besteht der Check (Exit 0) und die Ausgabe enthält `WARNING`
- **AND** ein leerer Wert für ein `required: false`-Secret (z.B. `BRAINSTORM_OIDC_SECRET`)
  besteht den Check ebenfalls ohne `--force`

---

### Requirement: env-seal.sh prüft Vollständigkeit und Duplikat-Keys

The system SHALL reject secrets files containing duplicate YAML keys (naming the duplicate)
and SHALL verify completeness against the schema (all `required: true` secrets and
`sealed: true` setup_vars present), failing with the missing key name if any are absent.

#### Scenario: Duplikat-Key wird abgelehnt

- **GIVEN** `mysecrets.yaml` enthält `KEYCLOAK_DB_PASSWORD` zweimal
- **WHEN** `bash scripts/env-seal.sh --_test-dup-check mysecrets.yaml` ausgeführt wird
- **THEN** schlägt der Check fehl
- **AND** die Ausgabe enthält `KEYCLOAK_DB_PASSWORD` und `Duplicate keys`

#### Scenario: Fehlender Pflicht-Secret-Key wird abgelehnt

- **GIVEN** `secrets.yaml` enthält nicht alle in `schema.yaml` als `required: true`
  deklarierten Secrets (z.B. fehlt `REQUIRED_SECRET`)
- **WHEN** `bash scripts/env-seal.sh --_test-completeness secrets.yaml --_test-schema schema.yaml`
  ausgeführt wird
- **THEN** schlägt der Check fehl und die Ausgabe nennt `REQUIRED_SECRET`

---

### Requirement: Dev-Secrets-Datei trägt environment=dev-Label

The system SHALL ensure that the `workspace-secrets` Secret in `k3d/secrets.yaml` carries
the label `environment: dev`, so that automated scans can identify dev-placeholder Secrets
and prevent accidental application to non-dev clusters.

#### Scenario: workspace-secrets hat environment=dev-Label

- **GIVEN** `k3d/secrets.yaml` enthält das `workspace-secrets`-Secret
- **WHEN** die YAML-Datei geparst und das Label `environment` des Secrets ausgelesen wird
- **THEN** hat das Secret den Label-Wert `environment: dev`

---

### Requirement: Taskfile.yml verwendet keine sed-basierte Kubernetes-Expansion

The system SHALL NOT contain a `sed` command that converts `$(VAR)` to `${VAR}` syntax
(i.e., `sed 's/\$(\([^)]*\))/\${\1}/g'`) in `Taskfile.yml`, as this pattern corrupts
native Kubernetes API-server variable expansion (`$(VAR_NAME)`) in container env fields.

#### Scenario: Kein korrupter sed-Befehl vorhanden

- **GIVEN** `Taskfile.yml` enthält die Task-Definitionen für alle Deploy-Kommandos
- **WHEN** nach dem spezifischen sed-Muster `s/\$(\([^)]*\))/\${\1}/g` gesucht wird
- **THEN** ist dieses Muster nicht vorhanden (grep schlägt fehl)

---

### Requirement: env-resolve.sh Sourcing

The system SHALL invoke `scripts/env-resolve.sh` exclusively via `source` (`. scripts/env-resolve.sh "$ENV"`), never via `bash scripts/env-resolve.sh`, because the script uses `return 1 2>/dev/null || exit 1` internally — direct execution causes the parent shell to exit, and all subsequent task commands in the same shell session are silently skipped.

#### Scenario: Direkter bash-Aufruf beendet die Parent-Shell

- **GIVEN** ein Task-Script enthält `bash scripts/env-resolve.sh "$ENV"` statt `source scripts/env-resolve.sh "$ENV"`
- **WHEN** der Task gestartet wird
- **THEN** beendet sich die aufrufende Shell nach dem `env-resolve.sh`-Aufruf mit Exit-Code 1
- **AND** alle nachfolgenden Befehle des Tasks (Validierung, Kustomize-Build, kubectl apply) werden nie ausgeführt

#### Scenario: Korrektes Sourcing exportiert alle Variablen

- **GIVEN** `source scripts/env-resolve.sh mentolder` wird im Task-Kontext aufgerufen
- **WHEN** der Aufruf erfolgreich abschließt
- **THEN** sind `ENV_CONTEXT`, `ENV_OVERLAY`, `WORKSPACE_NAMESPACE`, `PROD_DOMAIN` und alle weiteren Env-Variablen in der Shell-Session exportiert
- **AND** nachfolgende Befehle im selben Task-Script können auf diese Variablen zugreifen

---

### Requirement: ENV= immer explizit angeben

The system SHALL require an explicit `ENV=<name>` parameter for all environment-sensitive tasks (`workspace:deploy`, `workspace:office:deploy`, `workspace:post-setup`, `docs:deploy`, `workspace:talk-setup`), and SHALL default silently to `ENV=dev` when the parameter is omitted — this silent default means an omitted `ENV=` with a non-dev active kubectl context will deploy to whatever cluster is currently active without any warning.

#### Scenario: Fehlender ENV= mit falschem kubectl-Kontext

- **GIVEN** der aktive kubectl-Kontext ist `fleet` (Produktionscluster) und `ENV=` wird nicht gesetzt
- **WHEN** `task workspace:deploy` ohne ENV-Parameter aufgerufen wird
- **THEN** läuft der Task mit `ENV=dev` und baut den `k3d/`-Basis-Build
- **AND** der kubectl-Kontext-Mismatch-Check greift nicht (er prüft nur wenn `ENV != dev`), sodass der dev-Build auf dem Prod-Cluster angewendet wird

#### Scenario: Explizites ENV=mentolder trifft den richtigen Cluster

- **GIVEN** `ENV=mentolder` wird übergeben
- **WHEN** `task workspace:deploy ENV=mentolder` gestartet wird
- **THEN** löst `env-resolve.sh` `ENV_CONTEXT=fleet` auf und der Kontext-Mismatch-Check läuft
- **AND** der Task bricht ab, wenn der aktive kubectl-Kontext nicht `fleet` ist

---

### Requirement: Prod-Overlay-Hierarchie — nur prod-fleet wird direkt angewendet

The system SHALL resolve `ENV_OVERLAY` exclusively to a `prod-fleet/<brand>/` wrapper overlay for production deployments, and SHALL never directly apply the base `prod/` overlay or the standalone brand overlays `prod-mentolder/` or `prod-korczewski/` — applying these intermediate overlays risks leaving the cluster without credentials because the `$patch: delete` on `workspace-secrets` depends on the sealed secret already existing.

#### Scenario: ENV_OVERLAY zeigt auf prod-fleet-Wrapper

- **GIVEN** `environments/mentolder.yaml` enthält `overlay: prod-fleet/mentolder`
- **WHEN** `env-resolve.sh` diesen Wert als `ENV_OVERLAY` exportiert und `task workspace:deploy` ihn zum Kustomize-Build verwendet
- **THEN** wird `kustomize build prod-fleet/mentolder/` ausgeführt (nicht `prod/` oder `prod-mentolder/`)
- **AND** der Build enthält die `fleet-common`-Komponente und Fleet-spezifische Node-Affinity-Patches

#### Scenario: Direktes Anwenden von prod/ gefährdet Secrets

- **GIVEN** ein Operator führt manuell `kubectl apply -k prod/` aus (ohne via `workspace:deploy` zu gehen)
- **WHEN** der `$patch: delete`-Block in `prod/kustomization.yaml` das `workspace-secrets`-Secret löscht
- **THEN** entfernt `kubectl apply` das von SealedSecrets verwaltete Secret aus dem Cluster
- **AND** der SealedSecrets-Controller erstellt es neu — aber nur wenn das zugehörige SealedSecret bereits vorhanden war; fehlt es, verlieren alle Services sofort ihre DB-Verbindung

---

### Requirement: Neue Manifest-Variablen in Schema und Envsubst-Liste registrieren

The system SHALL require that any new `${VAR}` placeholder added to a Kubernetes manifest be registered in both `environments/schema.yaml` (as an `env_var` or `setup_var` entry) AND in the explicit `ENVSUBST_VARS` allowlist of every Taskfile task that processes that manifest — omitting either registration causes the placeholder to survive unexpanded into the cluster or be silently ignored by `envsubst`.

#### Scenario: Neue Var nur im Manifest, nicht in ENVSUBST_VARS

- **GIVEN** `k3d/nextcloud.yaml` enthält ein neues `${NEXTCLOUD_FEATURE_FLAG}` und dieser Key fehlt in der `ENVSUBST_VARS`-Liste des `workspace:deploy`-Tasks
- **WHEN** `task workspace:deploy ENV=mentolder` ausgeführt wird
- **THEN** bleibt das Literal `${NEXTCLOUD_FEATURE_FLAG}` im kubectl-Apply-Input erhalten
- **AND** je nach API-Server-Konfiguration akzeptiert Kubernetes es als Literal-String — der Fehler ist zur Laufzeit des Pods nicht sofort sichtbar

#### Scenario: Neue Var korrekt in Schema und Taskfile registriert

- **GIVEN** `environments/schema.yaml` enthält `NEXTCLOUD_FEATURE_FLAG` als `env_var` und `Taskfile.yml` listet `${NEXTCLOUD_FEATURE_FLAG}` in `ENVSUBST_VARS` für `workspace:deploy`
- **WHEN** `task workspace:deploy ENV=mentolder` mit `NEXTCLOUD_FEATURE_FLAG=enabled` ausgeführt wird
- **THEN** substituiert `envsubst` den Wert korrekt in das Manifest
- **AND** `task env:validate ENV=mentolder` prüft den Key gegen das Schema und schlägt fehl, wenn er in der Env-Datei fehlt

---

### Requirement: Collabora und CoTURN separat deployen

The system SHALL NOT include Collabora (`k3d/office-stack`) or CoTURN (`k3d/coturn-stack`) in the base `k3d/kustomization.yaml`, and these stacks SHALL be deployed exclusively via `task workspace:office:deploy` after `task workspace:deploy` has completed successfully — deploying in the wrong order or skipping the dedicated task leaves these services absent from the cluster without any error from the main deploy.

#### Scenario: Base-Build enthält kein Collabora oder CoTURN

- **GIVEN** `k3d/kustomization.yaml` referenziert nur die Core-Manifests
- **WHEN** `kubectl kustomize k3d/` ausgeführt wird
- **THEN** enthält der Output kein Deployment oder Service mit dem Namen `collabora`, `coturn` oder `janus`
- **AND** kein Fehler wird ausgegeben — das Fehlen dieser Ressourcen ist das erwartete Verhalten

#### Scenario: Korrekter Bring-Up-Order nach Cluster-Reset

- **GIVEN** ein frischer Cluster wurde mit `task workspace:deploy ENV=mentolder` hochgefahren
- **WHEN** Nextcloud-Talk-Videoanrufe getestet werden, bevor `task workspace:office:deploy ENV=mentolder` ausgeführt wurde
- **THEN** schlagen Videoanrufe fehl (kein CoTURN-TURN-Server und kein Collabora-Office erreichbar)
- **AND** die Lösung ist `task workspace:office:deploy ENV=mentolder` auszuführen, nicht `workspace:deploy` erneut

---

### Requirement: Cross-Brand-Änderungen explizit in beide Namespaces anwenden

The system SHALL require that cross-cutting infrastructure changes (database password rotation, OIDC client configuration, schema migrations, cert-manager updates) be applied explicitly to both the `workspace` namespace (mentolder) and the `workspace-korczewski` namespace (korczewski), because both brands run as separate per-namespace deployments on the same fleet cluster and share no automatic propagation mechanism.

#### Scenario: DB-Passwort-Rotation nur für eine Brand

- **GIVEN** `SHARED_DB_PASSWORD` wird in `environments/.secrets/mentolder.yaml` geändert, neu versiegelt und mit `task workspace:deploy ENV=mentolder` deployt
- **WHEN** `task workspace:deploy ENV=korczewski` nach der Rotation nicht ausgeführt wird
- **THEN** nutzt das korczewski-`shared-db` weiterhin das alte Passwort aus seinem `workspace-secrets`-Secret
- **AND** nach einem `rollout restart` der korczewski-Services scheitern Datenbankverbindungen, weil das Passwort nicht übereinstimmt

#### Scenario: OIDC-Client-Änderung im Keycloak-Realm

- **GIVEN** eine Änderung am OIDC-Client-Redirect-URI wird in beide Realm-JSON-Dateien eingetragen (`prod-fleet/mentolder/realm-workspace-mentolder.json` und `prod-fleet/korczewski/realm-workspace-korczewski.json`)
- **WHEN** `task workspace:deploy ENV=mentolder` läuft, aber `ENV=korczewski` ausgelassen wird
- **THEN** ist nur der mentolder-Keycloak-Realm aktualisiert
- **AND** korczewski-Nutzer erhalten `invalid_redirect_uri`-Fehler beim Login

---

### Requirement: env:generate muss vor env:seal und vor Prod-Deploy laufen

The system SHALL require that `task env:generate ENV=<env>` is executed before `task env:seal ENV=<env>` and before the first production deploy for any environment, because `scripts/talk-hpb-setup.sh` aborts with an error when signaling or TURN secrets carry the placeholder value `MANAGED_EXTERNALLY`, indicating they were never generated.

#### Scenario: Fehlende Generierung führt zu Abbruch in talk-hpb-setup

- **GIVEN** `environments/.secrets/mentolder.yaml` enthält `TALK_SIGNALING_SECRET: MANAGED_EXTERNALLY` (Platzhalter, weil `env:generate` nie ausgeführt wurde)
- **WHEN** `task workspace:deploy ENV=mentolder` die Post-Deploy-Kette ausführt und `talk-hpb-setup.sh` aufruft
- **THEN** bricht `talk-hpb-setup.sh` mit einer Fehlermeldung ab, die auf `MANAGED_EXTERNALLY`-Werte hinweist
- **AND** die Nextcloud-Talk-Signaling-Konfiguration bleibt unkonfiguriert

#### Scenario: Korrekte Reihenfolge env:generate → env:seal → workspace:deploy

- **GIVEN** ein frisches Produktionssetup für `ENV=mentolder`
- **WHEN** die Reihenfolge `task env:generate ENV=mentolder` → `task env:seal ENV=mentolder` → `task workspace:deploy ENV=mentolder` eingehalten wird
- **THEN** enthält `environments/.secrets/mentolder.yaml` keine `MANAGED_EXTERNALLY`-Platzhalter mehr
- **AND** `talk-hpb-setup.sh` konfiguriert das Nextcloud-Talk-Signaling erfolgreich mit den generierten Secrets

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Kustomize-Basis erfolgreich buildbar und nicht leer
<!-- bats: manifests.bats -->

The system SHALL produce a non-empty, syntactically valid Kustomize build from `k3d/` without requiring a running cluster.

#### Scenario: Kustomize-Build erfolgreich *(BATS)*
- **GIVEN** `k3d/kustomization.yaml` und alle referenzierten Ressourcen sind vorhanden; `k3d/secrets.yaml` existiert (oder wird temporär erzeugt)
- **WHEN** `kubectl kustomize k3d/ --load-restrictor=LoadRestrictionsNone` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0
- **AND** der erzeugte Output ist nicht leer (`-s`-Check)

---

### Requirement: Alle Core-Deployments im Basis-Build enthalten
<!-- bats: manifests.bats -->

The system SHALL render Deployments for `keycloak`, `nextcloud`, `shared-db`, `collabora`, `vaultwarden`, and `mailpit` in the base Kustomize build.

#### Scenario: Keycloak-Deployment vorhanden *(BATS)*
- **GIVEN** vollständiger Basis-Build aus `k3d/`
- **WHEN** Output nach `name: keycloak` und `kind: Deployment` gesucht wird
- **THEN** sind beide Strings vorhanden

#### Scenario: Alle weiteren Core-Deployments vorhanden *(BATS)*
- **GIVEN** vollständiger Basis-Build aus `k3d/`
- **WHEN** Output nach `nextcloud`, `shared-db`, `collabora`, `vaultwarden`, `mailpit` gesucht wird
- **THEN** sind alle Namen als `name:`-Einträge im YAML-Output vorhanden

---

### Requirement: Ingress mit allen Core-Hosts im Basis-Build
<!-- bats: manifests.bats -->

The system SHALL define at least one Ingress resource in the base build covering the virtual hosts `auth.*`, `files.*`, `office.*`, `vault.*`, and `mail.*`.

#### Scenario: Ingress-Ressource vorhanden *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** Output nach `kind: Ingress` gesucht wird
- **THEN** existiert mindestens ein Ingress-Objekt

#### Scenario: Alle Core-Hosts definiert *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** alle `host:`-Felder und `Host(\`...\`)`-Muster aus Traefik-IngressRoute-Regeln gesammelt werden
- **THEN** enthalten die Hosts Einträge für `auth`, `files`, `office`, `vault` und `mail` als Präfix

---

### Requirement: ConfigMaps für Realm, Nextcloud-OIDC und Domains vorhanden
<!-- bats: manifests.bats -->

The system SHALL render a `realm-template`, a `nextcloud-oidc-config`, and a `domain-config` ConfigMap in the base build.

#### Scenario: Alle drei Pflicht-ConfigMaps vorhanden *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** Output nach `name: realm-template`, `name: nextcloud-oidc-config` und `name: domain-config` gesucht wird
- **THEN** sind alle drei Namen im Output vorhanden

---

### Requirement: RBAC-Ressourcen für claude-code vorhanden
<!-- bats: manifests.bats -->

The system SHALL include RBAC resources (Role, ClusterRole, RoleBinding, or ServiceAccount) named or containing `claude-code` in the base build.

#### Scenario: claude-code RBAC vorhanden *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** Output nach `claude-code` und nach `kind: (Role|ClusterRole|RoleBinding|ServiceAccount)` gesucht wird
- **THEN** sind beide Muster im Output vorhanden

---

### Requirement: Backup-CronJob referenziert kritische Daten-PVCs
<!-- bats: manifests.bats -->

The system SHALL include a CronJob resource named `pvc-backup` in the base build that references `nextcloud-data-pvc` and `vaultwarden-data-pvc`.

#### Scenario: pvc-backup CronJob mit PVC-Referenzen *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** Output nach `kind: CronJob`, `name: pvc-backup`, `nextcloud-data-pvc` und `vaultwarden-data-pvc` gesucht wird
- **THEN** sind alle vier Muster im Output vorhanden

---

### Requirement: PersistentVolumeClaims für Stateful-Services vorhanden
<!-- bats: manifests.bats -->

The system SHALL declare PersistentVolumeClaim resources for stateful services in the base build.

#### Scenario: PVC-Ressourcen im Basis-Build *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** Output nach `kind: PersistentVolumeClaim` gesucht wird
- **THEN** existiert mindestens eine PVC-Ressource

---

### Requirement: Keine Klartext-Passwörter in Deployment-Env-Vars
<!-- bats: manifests.bats -->

The system SHALL NOT expose plaintext password values in container `env.value` fields — all credential references SHALL use `secretKeyRef` or `configMapKeyRef`.

#### Scenario: Keine hartcodierten Passwörter in Env-Feldern *(BATS)*
- **GIVEN** Basis-Build aus `k3d/`
- **WHEN** alle `value:`-Zeilen in der Nähe von `password`-Schlüsseln ausgewertet werden
- **THEN** enthalten keine dieser Zeilen verdächtige Klartext-Passwörter außerhalb von `valueFrom`-Referenzen

---

### Requirement: korczewski-Overlay pinnt vaultwarden-data-PVC auf longhorn
<!-- bats: manifests.bats -->

The system SHALL configure the `vaultwarden-data-pvc` in the `prod-fleet/korczewski` overlay with `storageClassName: longhorn` so that the pvc-backup CronJob can create CSI clones.

#### Scenario: vaultwarden-PVC auf longhorn gepinnt im korczewski-Overlay *(BATS)*
- **GIVEN** `prod-fleet/korczewski`-Overlay wird per `kubectl kustomize` gerendert
- **WHEN** alle PersistentVolumeClaim-Ressourcen nach `vaultwarden-data-pvc` gefiltert werden
- **THEN** hat diese PVC `storageClassName: longhorn`
- **AND** die Test-Ausgabe lautet `OK: vaultwarden pinned to longhorn`

---

### Requirement: tests-results-retention hat keine veraltete Node-Location-Affinity
<!-- bats: manifests.bats -->

The system SHALL NOT include a `node-location` nodeAffinity in `k3d/tests-retention-cronjob.yaml`, as this label does not exist on any fleet node after Phase 3 consolidation and would make the Job unschedulable.

#### Scenario: Keine veraltete node-location-Affinity *(BATS)*
- **GIVEN** `k3d/tests-retention-cronjob.yaml` (ohne Kommentarzeilen)
- **WHEN** nach dem String `node-location` gesucht wird
- **THEN** ist der String nicht vorhanden (grep schlägt fehl)

---

### Requirement: Alle Skripte unter scripts/ bestehen Bash-Syntax-Check
<!-- bats: scripts.bats -->

The system SHALL ensure every `*.sh` file under `scripts/`, `tests/lib/`, and `tests/local/` passes `bash -n` syntax validation without errors.

#### Scenario: scripts/*.sh syntaktisch korrekt *(BATS)*
- **GIVEN** alle Dateien unter `scripts/*.sh`
- **WHEN** `bash -n <file>` für jede Datei ausgeführt wird
- **THEN** gibt es keine Syntaxfehler in keiner Datei

#### Scenario: tests/lib/*.sh und tests/local/*.sh syntaktisch korrekt *(BATS)*
- **GIVEN** alle Dateien unter `tests/lib/*.sh` und `tests/local/*.sh`
- **WHEN** `bash -n <file>` ausgeführt wird
- **THEN** schlägt kein Skript fehl

---

### Requirement: Alle scripts/*.sh haben gültige Shebang-Zeile
<!-- bats: scripts.bats -->

The system SHALL ensure every `*.sh` file under `scripts/` starts with a `#!/` shebang line.

#### Scenario: Shebang vorhanden *(BATS)*
- **GIVEN** alle Dateien unter `scripts/*.sh`
- **WHEN** die erste Zeile jeder Datei geprüft wird
- **THEN** beginnt jede erste Zeile mit `#!/`

---

### Requirement: Konfigurationsdateien bestehen Syntax-Checks
<!-- bats: scripts.bats -->

The system SHALL ensure that `k3d/realm-workspace-dev.json` is valid JSON, `k3d/nextcloud-oidc-dev.php` passes PHP lint, and `k3d/kustomization.yaml` is valid YAML.

#### Scenario: realm-workspace-dev.json valides JSON *(BATS)*
- **GIVEN** `k3d/realm-workspace-dev.json` existiert
- **WHEN** `python3 -c "import json; json.load(open(...))"` ausgeführt wird
- **THEN** wird kein Fehler geworfen

#### Scenario: kustomization.yaml valides YAML *(BATS)*
- **GIVEN** `k3d/kustomization.yaml` existiert
- **WHEN** `python3 -c "import yaml; yaml.safe_load(open(...))"` ausgeführt wird
- **THEN** wird kein Fehler geworfen

#### Scenario: Taskfile.yml valides YAML und Version 3 *(BATS)*
- **GIVEN** `Taskfile.yml` existiert
- **WHEN** YAML-Parse und Grep nach `version: "3"` ausgeführt werden
- **THEN** bestehen beide Checks ohne Fehler

---

### Requirement: Test-Runner verhält sich korrekt bei Aufruf-Varianten
<!-- bats: scripts.bats -->

The system SHALL ensure `tests/runner.sh` prints usage on `--help` (exit 0) and exits non-zero with "Tier required" when called without arguments.

#### Scenario: runner.sh --help gibt Usage aus *(BATS)*
- **GIVEN** `tests/runner.sh` ist vorhanden
- **WHEN** `bash tests/runner.sh --help` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0 und die Ausgabe enthält `Usage`

#### Scenario: runner.sh ohne Argumente schlägt fehl *(BATS)*
- **GIVEN** `tests/runner.sh` ist vorhanden
- **WHEN** `bash tests/runner.sh` ohne Argumente ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit != 0 und die Ausgabe enthält `Tier required`

---

### Requirement: build-test-inventory.sh erkennt doppelte Test-IDs
<!-- bats: scripts.bats -->

The system SHALL exit non-zero and print "Duplicate test IDs found" when `scripts/build-test-inventory.sh` detects the same test ID prefix in multiple test files, and SHALL exit zero and write a valid JSON inventory when all IDs are unique.

#### Scenario: Duplikat-Test-IDs werden abgelehnt *(BATS)*
- **GIVEN** zwei Testdateien `tests/local/FA-1-login.bats` und `tests/local/FA-1-logout.bats` (gleicher Prefix `FA-1`) existieren
- **WHEN** `bash scripts/build-test-inventory.sh` ausgeführt wird
- **THEN** schlägt das Skript mit Exit != 0 fehl
- **AND** die Ausgabe enthält `Duplicate test IDs found` und `FA-1`

#### Scenario: Eindeutige Test-IDs erzeugen valides JSON-Inventar *(BATS)*
- **GIVEN** drei Testdateien mit eindeutigen IDs (`FA-1`, `FA-2`, `FA-3`)
- **WHEN** `bash scripts/build-test-inventory.sh` ausgeführt wird
- **THEN** endet das Skript mit Exit 0 und schreibt `website/src/data/test-inventory.json`
- **AND** das JSON-Array enthält genau 3 Einträge

---

### Requirement: Worktree-Erstellung umgeht git-crypt-Smudge-Filter-Fehler
<!-- bats: worktree-create.bats -->

The system SHALL provide `scripts/worktree-create.sh` that creates a usable git worktree even when a git-crypt smudge filter is configured, by neutralizing `filter.git-crypt.clean` and `filter.git-crypt.required` in the worktree's local config, so that neither a locked nor an unlocked repo blocks worktree creation.

#### Scenario: plain git worktree add schlägt mit git-crypt fehl (Smoke-Beweis) *(BATS)*
- **GIVEN** ein Git-Repo mit konfiguriertem `filter.git-crypt` (smudge schlägt ohne Key fehl) und verschlüsselten Dateien unter `secret/`
- **WHEN** `git worktree add -b bare <path> HEAD` ohne Helper ausgeführt wird
- **THEN** schlägt der Befehl mit Exit != 0 fehl und die Ausgabe enthält `key file`
- **AND** `secret/data.yaml` existiert nicht im neuen Worktree

#### Scenario: Helper erzeugt nutzbaren Worktree (entsperrtes Repo) *(BATS)*
- **GIVEN** das Haupt-Repo ist entsperrt (Key vorhanden in `.git/git-crypt/keys/default`)
- **WHEN** `bash scripts/worktree-create.sh feature/x <path> HEAD` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0
- **AND** `<path>/secret/data.yaml` existiert und enthält den entschlüsselten Wert `TOPSECRET-VALUE`
- **AND** der aktive Branch im neuen Worktree ist `feature/x`

#### Scenario: T000925 — clean- und required-Filter werden im Worktree neutralisiert *(BATS)*
- **GIVEN** `scripts/worktree-create.sh` hat den Worktree erstellt (entsperrtes Repo)
- **WHEN** die worktree-lokale git-Config nach `filter.git-crypt.clean` und `filter.git-crypt.required` gelesen wird
- **THEN** ist `filter.git-crypt.clean = cat` (Passthrough, kein Commit-Fehler)
- **AND** ist `filter.git-crypt.required = false` (fehlgeschlagener Smudge bricht Checkout nicht ab)
- **AND** Smudge ist NICHT neutralisiert (bleibt real für das entsperrte Repo)

#### Scenario: T000925 — git commit einer git-crypt-verwalteten Datei gelingt im Worktree *(BATS)*
- **GIVEN** Worktree wurde mit Helper erstellt (entsperrtes Repo)
- **WHEN** `secret/data.yaml` geändert und `git commit -am "..."` im Worktree ausgeführt wird
- **THEN** beendet sich der Commit mit Exit 0 (clean-Filter schlägt nicht fehl)

#### Scenario: Helper funktioniert auch bei gesperrtem Repo (kein Key) *(BATS)*
- **GIVEN** das Haupt-Repo ist gesperrt (`git-crypt/keys/default` fehlt)
- **WHEN** `bash scripts/worktree-create.sh fix/z <path> HEAD` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0
- **AND** `git status --porcelain` im neuen Worktree beendet sich mit Exit 0

#### Scenario: T000526 — Worktree löst node_modules aus Basis-Checkout auf *(BATS)*
- **GIVEN** das Haupt-Repo hat `node_modules/` installiert (z.B. `node_modules/cheerio/package.json`)
- **WHEN** `bash scripts/worktree-create.sh feature/nm <path> HEAD` ausgeführt wird
- **THEN** ist `<path>/node_modules/cheerio/package.json` über einen Symlink erreichbar
- **AND** der Inhalt entspricht dem Paket aus dem Basis-Checkout

#### Scenario: T000526 — node_modules-Provisioning ohne installierte Deps *(BATS)*
- **GIVEN** das Haupt-Repo hat kein `node_modules/`-Verzeichnis
- **WHEN** `bash scripts/worktree-create.sh feature/nonm <path> HEAD` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0 (kein Fehler)
- **AND** `<path>/node_modules` existiert nicht

#### Scenario: T000925 — brechender Smudge-Filter bricht Checkout nicht ab (required=false) *(BATS)*
- **GIVEN** `filter.git-crypt.smudge` ist auf `false` (immer fehlschlagend) gesetzt
- **WHEN** `bash scripts/worktree-create.sh fix/smudge-ok <path> HEAD` ausgeführt wird
- **THEN** beendet sich der Befehl mit Exit 0
- **AND** `git status --porcelain` im neuen Worktree beendet sich mit Exit 0

---

### Requirement: staging ENV resolves Overlay, Namespace und Context korrekt
<!-- bats: env-resolve.bats -->

The system SHALL export `ENV_CONTEXT=fleet`, `ENV_OVERLAY=prod-fleet/staging`, `WORKSPACE_NAMESPACE=workspace-staging`, `WEBSITE_NAMESPACE=website-staging`, and `BRAND_ID=staging` when `source scripts/env-resolve.sh staging` is called with a properly configured `environments/staging.yaml`.

#### Scenario: ENV=staging löst alle Schlüssel-Variablen auf *(BATS)*
- **GIVEN** `environments/staging.yaml` enthält `context: fleet`, `overlay: prod-fleet/staging`, `workspace_namespace: workspace-staging`, `website_namespace: website-staging`, `BRAND_ID: staging`
- **WHEN** `source scripts/env-resolve.sh staging` ausgeführt wird
- **THEN** sind `ENV_CONTEXT=fleet`, `ENV_DOMAIN=staging.example.test`, `ENV_OVERLAY=prod-fleet/staging`, `WORKSPACE_NAMESPACE=workspace-staging`, `WEBSITE_NAMESPACE=website-staging` und `BRAND_ID=staging` als Shell-Variablen exportiert

---

### Requirement: staging-db-anonymize.sh ist ausführbar und hat korrekte Shebang
<!-- bats: staging.bats -->

The system SHALL provide `scripts/staging-db-anonymize.sh` as an executable file with a `#!/usr/bin/env bash` shebang, and SHALL exit non-zero with a PGPORT-related error when `PGPORT` is not set.

#### Scenario: staging-db-anonymize.sh ist ausführbar mit korrekter Shebang *(BATS)*
- **GIVEN** `scripts/staging-db-anonymize.sh` existiert
- **WHEN** Ausführbarkeits-Flag und erste Zeile geprüft werden
- **THEN** ist das Skript ausführbar (`-x`)
- **AND** die erste Zeile ist `#!/usr/bin/env bash`

#### Scenario: staging-db-anonymize.sh schlägt ohne PGPORT fehl *(BATS)*
- **GIVEN** `PGPORT` ist in der Umgebung nicht gesetzt
- **WHEN** `bash scripts/staging-db-anonymize.sh` ohne Umgebungsvariablen ausgeführt wird
- **THEN** schlägt das Skript mit Exit != 0 fehl
- **AND** die Ausgabe (stdout oder stderr) enthält `PGPORT`

---

### Requirement: Task-Oracle lehnt Namespace-only-Eingaben ab
<!-- bats: task-oracle-fastpath.bats -->

The system SHALL NOT trigger the fast-path for inputs that consist only of a namespace without a colon-action (e.g., `"workspace"` alone), treating them as natural-language inputs that route to Hermes/OpenClaw.

#### Scenario: Nur Namespace-Eingabe triggert nicht den Fast-Path *(BATS)*
- **GIVEN** `task-oracle.sh` ist verfügbar
- **WHEN** `bash scripts/task-oracle.sh "workspace"` ausgeführt wird (kein Doppelpunkt-Action)
- **THEN** schlägt das Skript mit Exit 1 fehl
- **AND** stderr enthält `Neither Hermes nor OpenClaw`

#### Scenario: Strukturierter Input ohne ENV wird direkt ausgeführt *(BATS)*
- **GIVEN** `task workspace:deploy` ist als Task registriert
- **WHEN** `bash scripts/task-oracle.sh "workspace:deploy"` ohne ENV-Angabe ausgeführt wird
- **THEN** wird `task workspace:deploy` aufgerufen (ohne ENV-Override)
- **AND** die Ausgabe enthält `TASK_CALLED: workspace:deploy` ohne nachfolgendes `ENV=`

---

### Requirement: Produktions-Verzeichnisstruktur auf Dateisystem vorhanden
<!-- e2e: nfa-08-production-deploy.spec.ts -->

The system SHALL maintain a `prod/` directory, a `prod-mentolder/` overlay directory, a `prod-korczewski/` overlay directory, and a `k3d/` base manifest directory — each containing at least one YAML file.

#### Scenario: prod/-Verzeichnis existiert *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `fs.existsSync('prod')` geprüft wird
- **THEN** existiert das Verzeichnis

#### Scenario: Overlay-Verzeichnisse und k3d/-Basis vorhanden *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `prod-mentolder/`, `prod-korczewski/` und `k3d/` auf Existenz und YAML-Inhalt geprüft werden
- **THEN** existieren alle drei Verzeichnisse und enthalten jeweils mindestens eine `*.yaml`- oder `*.yml`-Datei

#### Scenario: cert-manager-Tasks in Taskfile.yml vorhanden *(E2E)*
- **GIVEN** `Taskfile.yml` existiert
- **WHEN** der Dateiinhalt nach `cert:` gesucht wird
- **THEN** ist der String `cert:` vorhanden (cert-manager-Tasks deklariert)

---

### Requirement: Kernservices nach Prod-Deploy erreichbar
<!-- e2e: nfa-03-availability.spec.ts | integration-smoke.spec.ts -->

The system SHALL ensure that Keycloak, Vaultwarden, and the Website respond with HTTP 200/301/302 after a successful production deployment, and the Website body SHALL NOT contain 502/503/504 gateway error messages.

#### Scenario: Vaultwarden antwortet auf /alive *(E2E)*
- **GIVEN** `task workspace:deploy ENV=mentolder` wurde erfolgreich ausgeführt
- **WHEN** GET `https://vault.<PROD_DOMAIN>/alive` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 301 oder 302

#### Scenario: Website erreichbar und gateway-fehlerfrei *(E2E)*
- **GIVEN** der Website-Pod läuft im Namespace `website`
- **WHEN** GET `$WEBSITE_URL` gesendet und die Seite im Browser geöffnet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 301 oder 302
- **AND** der `<body>` enthält keine Texte `502 Bad Gateway`, `503 Service Unavailable` oder `504 Gateway Timeout`

#### Scenario: Keycloak erreichbar *(E2E)*
- **GIVEN** `keycloak`-Deployment läuft im Namespace `workspace`
- **WHEN** GET `https://auth.<PROD_DOMAIN>` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 301 oder 302

---

### Requirement: Keycloak OIDC Discovery und Nextcloud-Status nach Deploy valide
<!-- e2e: integration-smoke.spec.ts -->

The system SHALL ensure that after a successful production deployment the Keycloak OIDC discovery endpoint returns a valid configuration document, and Nextcloud reports `installed: true`, `maintenance: false`, and `needsDbUpgrade: false`.

#### Scenario: Keycloak OIDC Discovery valide *(E2E)*
- **GIVEN** Keycloak läuft und der Realm `workspace` ist konfiguriert
- **WHEN** GET `https://auth.<PROD_DOMAIN>/realms/workspace/.well-known/openid-configuration` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und einem JSON-Body, der `issuer` (enthält die Domain), `authorization_endpoint` und `token_endpoint` enthält

#### Scenario: Nextcloud installiert und betriebsbereit *(E2E)*
- **GIVEN** Nextcloud-Deployment läuft und die Datenbank ist initialisiert
- **WHEN** GET `https://files.<PROD_DOMAIN>/status.php` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und JSON `{"installed": true, "maintenance": false, "needsDbUpgrade": false, ...}`

---

### Requirement: Collabora Discovery-Endpoint und Docs-Site nach Deploy erreichbar
<!-- e2e: integration-smoke.spec.ts -->

The system SHALL ensure that after `task workspace:office:deploy` the Collabora discovery endpoint responds with a WOPI discovery XML, and the Docs site responds with HTTP 200, 302, or 401.

#### Scenario: Collabora WOPI Discovery antwortet *(E2E)*
- **GIVEN** `task workspace:office:deploy ENV=mentolder` wurde nach `workspace:deploy` ausgeführt
- **WHEN** GET `https://office.<PROD_DOMAIN>/hosting/discovery` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und der Body enthält `wopi-discovery`

#### Scenario: Docs-Site erreichbar (inkl. Auth-Redirect) *(E2E)*
- **GIVEN** Docs-Deployment (`docs`) läuft im Namespace `workspace`
- **WHEN** GET `https://docs.<PROD_DOMAIN>` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200, 302 oder 401 (öffentlich, Auth-Redirect oder Auth-geschützt)
