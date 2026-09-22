## REMOVED Requirements

### Requirement: Staging-ID-Skript normalisiert Branch-Namen deterministisch

**Reason:** `scripts/staging-id.sh` diente nur dem On-demand-Staging aus
`taskfiles/Taskfile.staging.yml`, das per `k3d image import` in einen lokalen k3d-Cluster
deployte. k3d ist abgebaut (T900120, T900310), das Taskfile hat keine Aufrufer und entfällt mit
T900332 samt Skript.

**Migration:** Staging läuft über den Flux-verwalteten Stack `prod-fleet/staging`
(`flux-staging`, Namespace `workspace-staging`).

### Requirement: Staging-Stack-Kustomize-Build akzeptiert Platzhalter-Variablen

**Reason:** `k3d/staging-stack/` war die Kustomize-Basis desselben On-demand-Stagings und entfällt
mit T900332.

**Migration:** wie oben, `prod-fleet/staging`.
