## ADDED Requirements

### Requirement: Sessions-Server-Nginx läuft als Non-Root

Das Deployment `sessions-server` in `k3d/sessions-server.yaml` MUSS auf den
Unprivileged-Nginx-Pattern umgebaut sein: Der Container lauscht auf Port 8080 statt 80,
der Container-securityContext setzt `runAsNonRoot: true` und
`allowPrivilegeEscalation: false`, und der zugehörige Service zeigt mit seinem
`targetPort` auf denselben Port. Die nginx-Konfiguration (ConfigMap
`sessions-server-nginx`) MUSS pid- und temp-Pfade unterhalb eines beschreibbaren
Volumes legen, damit `readOnlyRootFilesystem` möglich bleibt. Der externe Traffic-Pfad
über den Ingress bleibt unverändert erreichbar.

#### Scenario: Manifest deklariert Unprivileged-Nginx

- **GIVEN** das Deployment-Manifest `k3d/sessions-server.yaml`
- **WHEN** der Pod-Spec geprüft wird
- **THEN** lauscht der nginx-Container auf Port 8080
- **AND** der Container-securityContext enthält `runAsNonRoot: true` und
  `allowPrivilegeEscalation: false`

#### Scenario: Service zeigt auf den neuen Port

- **GIVEN** der Service für sessions-server im selben Manifest
- **WHEN** sein `targetPort` geprüft wird
- **THEN** verweist er auf denselben Port wie der Container (8080)
