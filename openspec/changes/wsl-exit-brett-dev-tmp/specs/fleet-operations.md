# Delta Spec: fleet-operations (wsl-exit-brett-dev-tmp)

## ADDED Requirements

### Requirement: Dev-Stack-Pods ohne Root laufen mit schreibbarem tmp

Dev-Stack-Deployments in `k3d/dev-stack/`, die mit `runAsUser != 0` laufen,
MÜSSEN ein `emptyDir`-Volume auf `/tmp` mounten, damit Images, die zur
Laufzeit unter `/tmp` anlegen (z. B. tsx, npm), nicht beim Start crashen.

#### Scenario: Brett-Dev-Pod startet als uid 1000

- **GIVEN** das Dev-Image läuft mit `runAsUser: 1000`
- **WHEN** der Pod startet und `/tmp/tsx-1000` anlegen will
- **THEN** existiert ein `emptyDir`-Mount auf `/tmp` und der Pod erreicht
  `Running` ohne CrashLoopBackOff

#### Scenario: Neue dev-stack-Deployments erben das Muster

- **GIVEN** ein Deployment in `k3d/dev-stack/` setzt `runAsUser != 0`
- **WHEN** das Manifest per BATS-Test geprüft wird
- **THEN** enthält der Container ein `/tmp`-Volume vom Typ `emptyDir`
