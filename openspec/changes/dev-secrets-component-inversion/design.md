# Design — dev-secrets-component-inversion

## D1: Inversions-Mechanik — Overlay + Component (Operator-Entscheid 2026-08-24)

Neues Verzeichnis `components/dev-secrets/` **außerhalb** `k3d/` als Kustomize-Komponente;
neuer Dev-Einstiegspunkt `k3d-dev/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: workspace
resources:
  - ../k3d
components:
  - ../components/dev-secrets
```

Prod bleibt auf `../k3d` (jetzt secret-frei). Die Grenze ist Verzeichnis-scharf statt
patchlisten-scharf. Alternativen verworfen: resources-only-Entfernung (kein Kustomize-Verbund,
Validate baut Secrets weiter), zwei vollständige Basen (Duplikationspflege).

## D2: Kern-Scope — Datei-Mapping

| Quelle (heute) | Inhalt | Ziel |
|---|---|---|
| `k3d/secrets.yaml` | Secret `workspace-secrets` | `components/dev-secrets/workspace-secrets.yaml` |
| `k3d/secrets.yaml` | Secret `knowledge-secrets` | `components/dev-secrets/knowledge-secrets.yaml` |
| `k3d/ntfy.yaml` | Secret `ntfy-tokens` (+ Deployment/Service/IngressRoute) | nur Secret → `components/dev-secrets/ntfy-tokens-secret.yaml`; Workload bleibt im Base |
| `k3d/pentest-flags.yaml` | Secret `pentest-internal-vault` (+ ConfigMap) | nur Secret → `components/dev-secrets/pentest-vault-secret.yaml`; ConfigMap bleibt im Base |
| `k3d/backup-secrets.yaml` | Secret `backup-secrets` | `components/dev-secrets/backup-secrets.yaml` (war bereits außerhalb des Renders) |
| `k3d/vaultwarden-seed-credentials.yaml` | Secret `vaultwarden-seed-credentials` | `components/dev-secrets/vaultwarden-seed-credentials.yaml` (dito) |

Non-Goal (Folgeticket möglich): Unterstack-Secrets mit eigenen Build-Pfaden
(coturn/office/monitoring/sdlc/rustdesk/website-dev-secrets) — erreichen den Prod-Render
nicht. `network-policies-dev.yaml` (Base-referenziert, prod patch-delete) ist gleiches Muster,
aber kein Secret und damit explizit out of scope.

## D3: Physische Verschiebung inkl. Guard-Folgen (Operator-Entscheid)

Dateien wandern real; Pfad-gepinnnte Stellen werden im selben Durchgang angepasst:
`scripts/env-seal.sh` (Schreibziel), schema-sync/env-seal-BATS, Spec-Deltas auf vier Eltern-Slugs.
Ein Halbumzug ("Pfad behalten") würde Req. 1 nur halb erfüllen und die Footgun im Validate-Task
(`kubectl kustomize k3d/`) belassen.

## D4: Label `dev-seed: "true"` auf allen Komponenten-Ressourcen

Einheitlich pro Ressource (`metadata.labels.dev-seed: "true"`). Maschinenlesbares Merkmal für
den Prod-Render-Guard (D6); bewusst NICHT als Namespace/Annotation, damit es über kubectl-Labels
abfragbar bleibt. Seed-Daten im engeren Sinn (vaultwarden-seed) tragen zusätzlich ihren
bestehenden Kontext; das Label allein ist keine Sicherheitsgrenze, sondern Inventur-Merkmal.

## D5: Consumer-Umstellung Dev-Einstiegspunkt

Auffindung verpflichtend im Plan-Partial (grep nach `-k k3d`, `kustomize build k3d`,
`kubectl kustomize k3d`): Taskfile-Deploy-/Validate-Tasks wechseln auf `k3d-dev`;
Runbook-/Docs-Stellen folgen. Risiko dokumentiert: vergessene Consumer bekommen künftig KEIN
`workspace-secrets` mehr (fail-loud im Cluster, nicht still).

## D6: Prod-Render-Guard fail-closed

Neuer BATS-Guard (RED-first): `kustomize build prod-fleet/mentolder` (und korczewski) darf
weder ein `kind: Secret`-Dokument noch eine `dev-seed`-gelabelte Ressource enthalten;
zusätzlich Assertion: `prod/kustomization.yaml` enthält keinen Secret-`$patch: delete`.
Fehlermeldung nennt Datei+Ressource. Damit ist die alte "defensive patch-delete"-Denke
durch einen harten Test ersetzt.

## Risiken

- Kustomize-Build-Reihenfolge: Secrets der Komponente vs. Workloads im Base — kustomize
  sortiert Namespace-first; SealedSecret-Wait-Pfade in Deploys unverändert.
- `env-resolve.sh`/Deploy-Skripte mit hartem Pfadbezug auf `k3d/secrets.yaml` → grep-Inventar
  im Partial P2, jede Fundstelle umstellen oder explizit als Non-Consumer begründen.
- Flux-Artefakt rendert nur Prod-Overlays — kein Einfluss erwartet; Validate nachziehen.
