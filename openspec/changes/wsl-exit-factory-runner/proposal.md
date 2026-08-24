# Proposal: wsl-exit-factory-runner

## Why

Der Factory-Kern (dispatcher.js, wakeup.sh, watchdog) läuft als systemd
User-Timer auf dem WSL-Host. Mit dem WSL-Exit (Epic T016422, ADR-007)
entfällt diese Laufzeit. Der Dispatcher wird ein single-replica Deployment
„factory-runner" im Fleet — wakeup.sh bleibt unverändert nutzbar, denn es ist
bewusst dumb (Inversion of Intelligence, software-factory spec §4): alle
Guards liest es frisch aus den Brand-DBs.

_Ticket: T016433_ · Parent-Epic: T016422 · depends: T016436 (ADR-007),
T016430 (Endpoints für tickets.*)

## What Changes

1. **Deployment `factory-runner`** (Namespace `workspace-dev` oder eigener
   `factory`-Namespace — beim Implementieren nach bestehender Namespace-
   Logik entscheiden): single-replica (`strategy: Recreate`), Container mit
   Repo-Clone unter `/work/repo` auf einem Longhorn-PVC (RWO genügt bei
   single-replica; File-Lock-Semantik von agent-lock.sh bleibt gültig).
2. **SealedSecrets-Bundle** nach dem Muster
   `flux/clusters/fleet/bootstrap/github-token-sealedsecret.yaml`: git-crypt-Key,
   gh-PAT, Cloud-API-Keys (deepseek/alibaba), FACTORY_ENV_FILE-Inhalt.
3. **CronJob-Tick**: stößt `wakeup.sh` an (statt systemd-Timer); Hang-Kill
   ersetzt RuntimeMaxSec durch `timeout` im CronJob-Command; idle-retick-
   Schleife bleibt in wakeup.sh.
4. **FreeToken Best-Effort**: :1919 ist über wg/NAT nur erreichbar, wenn der
   Windows-Desktop läuft (P0-Spike-Gate, Runbook T016436). Eskalationskette
   deepseek/alibaba wird First-Class konfiguriert; Budget-Guards lesen weiter
   frisch aus den Brand-DBs.

## Impact

- Affected specs: `software-factory`
- Affected code: neue Manifeste (deployment/pvc/cronjob/sealedsecret),
  ggf. `flux/clusters/fleet/`-Kustomization-Eintrag
- Die systemd-Timer-Factory wird erst NACH grünem Fleet-Betrieb stillgelegt
  (Übergangslaufzeit doppelt möglich — agent-lock verhindert Doppelticks
  nur pro Checkout; deshalb: WSL-Timer disablen bevor CronJob aktiviert wird).
