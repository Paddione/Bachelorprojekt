# Delta Spec: fleet-operations (wsl-exit-brett-dev-tmp)

## ADDED Requirements

### Requirement: Dev-Stack-Pods ohne Root laufen mit schreibbarem tmp

Dev-Stack-Deployments in `k3d/dev-stack/`, die mit `runAsUser != 0` und
`readOnlyRootFilesystem: true` laufen, MÜSSEN jeden zur Laufzeit beschriebenen
Pfad als `emptyDir` einbinden. Für Node-basierte Images (tsx, npm) ist das
explizit `/tmp` — deren Laufzeit legt dort Zustand an (`/tmp/tsx-<uid>`,
npm-Cache). Bilder, die nachweislich nicht nach `/tmp` schreiben (oauth2-proxy-
Familie), stehen im Test unter begründeter Allowlist.

#### Scenario: Brett-Dev-Pod startet als uid 1000

- **GIVEN** das Dev-Image läuft mit `runAsUser: 1000`
- **WHEN** der Pod startet und `/tmp/tsx-1000` anlegen will
- **THEN** existiert ein `emptyDir`-Mount auf `/tmp` und der Pod erreicht
  `Running` ohne CrashLoopBackOff

#### Scenario: Neue dev-stack-Deployments erben das Muster

- **GIVEN** ein Deployment in `k3d/dev-stack/` setzt `runAsUser != 0` und
  `readOnlyRootFilesystem: true`
- **WHEN** das Manifest per BATS-Test geprüft wird
- **THEN** enthält der Container einen `/tmp`-emptyDir-Mount oder steht mit
  schriftlicher Begründung in der Test-Allowlist
