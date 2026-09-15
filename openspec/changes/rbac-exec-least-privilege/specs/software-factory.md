## MODIFIED Requirements

### Requirement: Factory Dispatcher Runs In-Cluster
<!-- bats: software-factory/tick-http-wakeup.bats -->

The factory dispatcher SHALL run as a single-replica Deployment named
`factory-runner` in namespace `workspace-dev` with a ReadWriteOnce-compatible
(RWX) Longhorn workdir containing a full repository clone including `.worktrees/`.
The CronJob `factory-tick` SHALL trigger a tick through an HTTP wakeup endpoint served by the
runner (`POST /wakeup` on the ClusterIP Service `factory-runner`) instead of `kubectl exec`; the
CronJob pod SHALL NOT mount a ServiceAccount token and its ServiceAccount SHALL NOT hold `pods/exec`.

Rationale: Mit der WSL-Stilllegung verliert der Factory-Dispatcher (systemd
User-Timer) seinen Laufzeitort. Ein single-replica Pod erhält die Dateisystem-
Semantik (agent-lock.sh, Worktrees, Session-Koordination), die mehrere
Design-Dokumente als "Single-Host"-Realität dokumentieren. Der Anstoß per `kubectl exec`
verlangte `pods/exec` für den ganzen Namespace `workspace-dev` (Pod-Namen sind nicht per
`resourceNames` adressierbar) und damit Exec-Zugriff auf jeden Pod dort, einschließlich des dev-pod.

#### Scenario: Tick wird aus dem Cluster angestoßen *(BATS)*

- **GIVEN** das Deployment `factory-runner` ist Ready und ein CronJob `factory-tick` existiert
- **WHEN** der CronJob-Schedule feuert
- **THEN** ruft der CronJob-Pod `POST /wakeup` am Service `factory-runner` auf, genau eine Runner-Instanz
  führt einen Tick aus (`scripts/factory/wakeup.sh`) gegen den Repo-Clone im RWX-Volume, ohne dass ein
  WSL-Host erreichbar sein muss, und der Job endet nur dann erfolgreich, wenn der Tick mit Exit 0 endet

#### Scenario: Der Tick-Anstoß hält keine Exec-Rechte *(BATS)*

- **GIVEN** die Manifeste in `k3d/dev-stack/factory-runner.yaml`
- **WHEN** Rollen, Bindings und der CronJob-Pod deklariert werden
- **THEN** existiert keine Rolle mit `pods/exec` für die ServiceAccount `factory-tick`, der CronJob-Pod setzt
  `automountServiceAccountToken: false` und ruft kein `kubectl` auf

#### Scenario: Ein paralleler Wakeup startet keinen zweiten Tick *(BATS)*

- **GIVEN** ein Wakeup läuft bereits
- **WHEN** ein zweiter `POST /wakeup` eintrifft
- **THEN** antwortet der Listener mit HTTP 409 und startet `wakeup.sh` nicht erneut

#### Scenario: Credentials kommen ausschließlich aus SealedSecrets

- **GIVEN** git-crypt-Key, gh-PAT und Cloud-API-Keys als SealedSecrets im Namespace `workspace-dev` liegen
- **WHEN** der Runner-Pod startet
- **THEN** mountet er die entsiegelten Secrets als Files/Env und loggt keinen Secret-Inhalt

#### Scenario: LLM-Ausfall degradiert statt blockiert

- **GIVEN** FreeToken auf dem Windows-GPU-Host ist nicht erreichbar (Workstation aus)
- **WHEN** ein Tick startet
- **THEN** fällt der Runner auf die konfigurierte Eskalationskette (DeepSeek/Alibaba)
  zurück oder beendet den Tick mit explizitem Fehler-Status, anstatt zu hängen
