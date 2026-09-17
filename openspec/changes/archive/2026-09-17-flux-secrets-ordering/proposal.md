# Proposal: flux-secrets-ordering

_Ticket: T900014 (fix, hoch/major, comp=infra) — LATENT: shared-db-Ausfall kehrt bei jedem Neustart zurück_

## Why

T900011 (shared-db-Ausfall 2026-08-30): PR #5302 legte einen `secretKeyRef` auf
`PENPOT_DB_PASSWORD` ins shared-db-Deployment. Flux rollte das Manifest aus, BEVOR
der Key im Cluster existierte — die In-Cluster-SealedSecret stand 6 Tage alt auf
`observedGeneration=86`. Die Brand-SealedSecrets hängen NICHT am Flux-Pfad im Sinne
einer Ordnungsbeziehung: `flux-mentolder` / `flux-korczewski` / `flux-staging`
deklarieren in `dependsOn` nur `flux-infra-controllers`, sodass jeder künftige
Manifest-Change mit neuem Secret-Key denselben Race erneut auslösen kann.

Stand 2026-09-04 (verifiziert im Haupt-Checkout):
- `flux/clusters/fleet/ks-sealed-secrets.yaml` enthält bereits alle drei
  Kustomizations (`flux-sealed-secrets-mentolder/-korczewski/-staging`) — der im
  Ticket vermutete Fehlstand „Gegenstück fehlt" ist damit überholt.
- `scripts/flux-render-artifact.sh` kopiert `fleet-mentolder.yaml` /
  `fleet-korczewski.yaml` / `staging.yaml` korrekt nach
  `out/sealed-secrets/<brand>/` — die Pfade der Kustomizations lösen auf.
- Es fehlt NUR die Ordnungs-Kante: keine Brand-/Staging-Kustomization hängt per
  `dependsOn` an ihrer Sealed-Secrets-Kustomization.
- `PENPOT_DB_PASSWORD` existiert aktuell in KEINER SealedSecret-Datei und wird in
  `k3d/` / `prod-fleet/` / `flux/` nirgends mehr referenziert (Penpot wurde mit
  T900030 / PR #5433 vollständig entfernt). Es muss daher KEIN Key nachgetragen
  werden — der akute Auslöser ist weg, das latente Race bleibt.

Symptom (beobachtet, Fakt) vs. Ursache (Annahme, verifiziert): Symptom war der
shared-db-CrashLoop nach PR #5302; als Ursache bestätigt ist die fehlende
Reconcile-Ordnung zwischen Workload- und Secret-Kustomizations (Race, kein
Tippfehler im Key). Beleg: `dependsOn`-Listen in `ks-mentolder.yaml`,
`ks-korczewski.yaml`, `ks-staging.yaml` (je nur `flux-infra-controllers`) gegen
`ks-sealed-secrets.yaml` (alle drei Secrets-Kustomizations vorhanden).

## What

Flux-Reconcile-Ordnung schließen: `flux-mentolder`, `flux-korczewski` und
`flux-staging` bekommen je einen `dependsOn`-Eintrag auf ihre
`flux-sealed-secrets-<brand>`-Kustomization, sodass Secrets VOR dem Brand-Stack
reconciled werden. Kein neuer Secret-Key, keine neuen Kustomizations, kein
Verhalten außerhalb der Reconcile-Reihenfolge. SSOT-Delta auf
`openspec/specs/workspace-deploy.md` (ergänzt die dortige
`flux-sealed-secrets`-Ordnungsregel, die bisher nur `flux-platform` abdeckt).

Nicht enthalten: Rotation/Neuerstellung von Secret-Keys, `workspace:deploy`-Pfad,
Drift-Monitoring (der Ticket-Messbefehl bleibt manueller Nachweis).
