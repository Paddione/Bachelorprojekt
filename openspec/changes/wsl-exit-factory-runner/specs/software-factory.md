# Delta Spec: software-factory (wsl-exit-factory-runner)

## MODIFIED Requirements

### Requirement: Der Dispatcher ist ortsunabhängig triggerbar

Der Factory-Dispatcher MUSS ohne systemd User-Timer auskommen: ein CronJob im
Fleet stößt `wakeup.sh` an; der Hang-Kill (bisher RuntimeMaxSec) MUSS durch
`timeout` im CronJob-Command äquivalent sichergestellt sein.

#### Scenario: Tick-Anstoß ohne Dev-Host

- **GIVEN** der WSL-Host ist heruntergefahren
- **WHEN** der factory-runner-CronJob feuert
- **THEN** läuft ein voller Dispatcher-Tick (PREP liest Guards frisch aus den
  Brand-DBs) und wird bei Hängen nach RuntimeMaxSec-Äquivalent getötet

### Requirement: Credentials sind sealed und nur im Cluster sichtbar

Alle Factory-Credentials (git-crypt-Key, gh-PAT, Cloud-API-Keys, Env-File)
MÜSSEN als SealedSecrets nach bestehendem Flux-Muster vorliegen.

#### Scenario: Neuer Runner startet mit verschlüsselten Credentials

- **GIVEN** das SealedSecrets-Bundle ist im Fleet reconciled
- **WHEN** der Runner-Container startet
- **THEN** findet wakeup.sh FACTORY_ENV_FILE und git-crypt-Key unter den
  gemounteten Pfaden und ein Tick kann einen PR erzeugen

## ADDED Requirements

### Requirement: Doppelticks über die Host→Fleet-Migration sind ausgeschlossen

Während der Migration DÜRFEN systemd-Timer und Fleet-CronJob nicht gleichzeitig
aktiv sein; der Wechsel MUSS dokumentiert disable-vor-enable folgen.

#### Scenario: Umschaltung der Tick-Quelle

- **GIVEN** beide Trigger wären konfigurierbar
- **WHEN** der Fleet-CronJob aktiviert wird
- **THEN** ist der WSL-systemd-Timer zu diesem Zeitpunkt bereits disabled und
  das Runbook hält die Reihenfolge fest
