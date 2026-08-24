## ADDED Requirements

### Requirement: Factory Dispatcher Runs In-Cluster

The factory dispatcher SHALL run as a single-replica Deployment named
`factory-runner` in namespace `workspace-dev` with a ReadWriteOnce-compatible
(RWX) Longhorn workdir containing a full repository clone including `.worktrees/`.

Rationale: Mit der WSL-Stilllegung verliert der Factory-Dispatcher (systemd
User-Timer) seinen Laufzeitort. Ein single-replica Pod erhält die Dateisystem-
Semantik (agent-lock.sh, Worktrees, Session-Koordination), die mehrere
Design-Dokumente als "Single-Host"-Realität dokumentieren.

#### Scenario: Tick wird aus dem Cluster angestoßen

- **GIVEN** das Deployment `factory-runner` ist Ready und ein CronJob `factory-tick` existiert
- **WHEN** der CronJob-Schedule feuert
- **THEN** führt genau eine Runner-Instanz einen Tick aus (`scripts/factory/wakeup.sh`)
  gegen den Repo-Clone im RWX-Volume aus, ohne dass ein WSL-Host erreichbar sein muss

#### Scenario: Credentials kommen ausschließlich aus SealedSecrets

- **GIVEN** git-crypt-Key, gh-PAT und Cloud-API-Keys als SealedSecrets im Namespace `workspace-dev` liegen
- **WHEN** der Runner-Pod startet
- **THEN** mountet er die entsiegelten Secrets als Files/Env und loggt keinen Secret-Inhalt

#### Scenario: LLM-Ausfall degradiert statt blockiert

- **GIVEN** FreeToken auf dem Windows-GPU-Host ist nicht erreichbar (Workstation aus)
- **WHEN** ein Tick startet
- **THEN** fällt der Runner auf die konfigurierte Eskalationskette (DeepSeek/Alibaba)
  zurück oder beendet den Tick mit explizitem Fehler-Status, anstatt zu hängen

### Requirement: Dev-Stack Pods Have a Writable Temp Directory

Dev-stack Deployments, deren Image als non-root-User (uid != 0) läuft und zur
Laufzeit nach `/tmp` schreibt (z. B. tsx IPC: `mkdir /tmp/<uid>`), SHALL ein
tmp emptyDir am Mountpunkt `/tmp` deklarieren.

Rationale: brett-dev crashte 152× mit `mkdir '/tmp/tsx-1000' ENOENT`, weil das
neue Dev-Image als uid 1000 läuft und `/tmp` im Container-Layer nicht beschreibbar war.

#### Scenario: brett-dev startet ohne tmp-CrashLoop

- **GIVEN** das Deployment `brett` in workspace-dev definiert ein tmp emptyDir für `/tmp`
- **WHEN** der Pod startet und tsx seine IPC-Server-Socket-Datei anlegt
- **THEN** erreicht der Container Ready innerhalb von 60 Sekunden ohne Restart

### Requirement: SDLC Console Runs Fleet-Natively Without Host Endpoints

Die sdlc-console SHALL auf dem Fleet (namespace `workspace-dev`) laufen und
DABEI keine manuellen Endpoints-Einträge auf k3d-Bridge-IPs (z. B. 172.23.0.1)
verwenden.

Rationale: Der `llm-proxy-host`-Service adressierte den WSL-seitigen Proxy über
eine docker-Bridge-IP — im Fleet nicht auflösbar. Der LLM-Zugriff läuft über
FreeToken (:1919) via wg-mesh bzw. Eskalationskette.

#### Scenario: Console erreicht LLM-Backend ohne WSL

- **GIVEN** sdlc-console läuft als Pod im Fleet und WSL ist heruntergefahren
- **WHEN** die Console einen Completion-Request stellt
- **THEN** antwortet ein über wg-mesh/DNS erreichbarer LLM-Endpunkt (kein
  localhost-Portforward, keine Bridge-IP)

### Requirement: Internal MCP Endpoints for the bge Pair

Für bge-embed und bge-rerank SHALL je eine interne IngressRoute existieren, so
dass MCP-Clients über wg-mesh ohne kubectl port-forward konsumieren können.

Rationale: Die bisherigen localhost-Portforwards (:8081/:8093) sterben mit WSL.

#### Scenario: MCP embeddet ohne Portforward

- **GIVEN** ein MCP-Client im wg-mesh kennt die interne bge-Endpoint-URL
- **WHEN** er einen Embed-Request sendet
- **THEN** antwortet llm-gateway-embed (Cross-Namespace-Ref nach workspace)
  mit HTTP 200, ohne dass ein lokaler Tunnel besteht
