# Proposal: staging-verdrahtung

## Why

`workspace-staging` ist GitOps-verwaist: keine Flux-Kustomization targetiert die
Staging-Namespaces (`flux/clusters/fleet/` kennt ks-mentolder/korczewski/website-*/dev/jobs,
aber kein ks-staging), und der Renderer (`scripts/flux-render-artifact.sh`) rendert keinen
Staging-Baum. Die 63 Tage alten Objekte stammen aus einem Manuell-Apply von
`prod-fleet/staging/`. Folge: Die App-CronJobs (scheduled-publish, admin-actions-cleanup,
notify-unread, tests-results-retention) curlen `website.website.svc.cluster.local` — der
Service existierte im Staging nie, die Staging-DB bekam nie die Website-Migrationen →
täglicher CrashLoopBackOff (T014538, SA-FC-02). Die 4 CronJobs sind interim per kubectl
suspendiert (reversibel); Rücknahme soll per GitOps geschehen.

Operator-Entscheidung 2026-08-23 (T015004): Staging **voll verdrahten** —
`prod-fleet/staging/` als ks-staging in Flux aufnehmen, voller Stack inkl. Website.

_Ticket: T015004_

## What

1. **Renderer:** Zwei neue Render-Blöcke in `scripts/flux-render-artifact.sh`
   (`prod-fleet/staging` → `out/staging/staging.yaml`, `prod-fleet/website-staging` →
   `out/website-staging/website-staging.yaml`, beide mit `env-resolve.sh staging`),
   Sealed-Secrets-Kopie nach `out/sealed-secrets/staging/`, Validation-Gate-Einträge für
   beide neuen Bäume. Machbarkeit verifiziert: der Overlay baut sauber und alle
   Nicht-Runtime-Vars lösen aus dem staging-Profil auf (Probe 2026-08-23, Reste sind
   ausschließlich `$${VAR}`-Runtime-Vars aus Skriptblöcken).
2. **Website-Staging-Overlay NEU:** `prod-fleet/website-staging/` nach Prior-Art
   `prod-fleet/website-mentolder/` (namespace `website-staging`; die Website lebt laut
   fleet-common-Kontrakt bewusst NICHT im Workspace-Overlay).
3. **Env-Profil ergänzen:** `environments/staging.yaml` erhält
   `WEBSITE_IMAGE_DIGEST`/`BRETT_IMAGE_DIGEST`(+`BRETT_IMAGE`) als dokumentierte
   Offline-Placeholder (Spiegel von `fleet-mentolder.yaml:23–26`); CI setzt echte Digests
   via `scripts/resolve-image-digest.sh`.
4. **Flux:** `flux/clusters/fleet/ks-staging.yaml` (name `flux-staging`, path `./staging`,
   dependsOn `flux-infra-controllers`, prune true), `ks-website-staging.yaml`
   (name `flux-website-staging`, path `./website-staging`) und ein drittes Dokument in
   `ks-sealed-secrets.yaml` (`flux-sealed-secrets-staging`, path `./sealed-secrets/staging`,
   prune false) — jeweils nach dem Brand-Muster.
5. **Secrets:** Das vorhandene `environments/sealed-secrets/staging.yaml` ist bereits auf
   `workspace-staging`/`website-staging`/`monitoring` gesealed und wird unverändert
   verdrahtet. Keine Plaintext-Seeds (Schnittstelle zu T014546 SA-GR-02 bleibt unberührt).
6. **CronJob-Rücknahme ohne Repo-Change:** Die Manifeste deklarieren kein `suspend:`-Feld;
   der Flux-Apply entfernt das per kubectl gesetzte Interim-Suspend automatisch
   (Server-Side Apply). Verifikation erfolgt im Deploy-/E2E-Schritt.
7. **Guards:** BATS unter `tests/spec/fleet-operations/` (Spec-Slugs-Verzeichnis existiert):
   Flux-Wiring (Dateien + paths/sourceRef/dependsOn + Renderer-Blöcke + Gate-Einträge +
   Digest-Placeholder) und CronJob-Ziel (gerendertes Staging-Manifest setzt
   `WEBSITE_NAMESPACE=website-staging`, kein Cross-Fire nach Prod).
8. **Doku:** Flux-Abschnitt in `CLAUDE.md` um den Staging-Stack ergänzen.

## Entscheidungen (Brainstorming 2026-08-23)

- **D1 Website separat, nicht ins Workspace-Overlay gefaltet.** Prior-Art: beide Brands
  fahren `prod-fleet/website-<brand>` als eigenen Overlay/Namespace; der
  `prod-fleet/components/fleet-common`-Kommentar dokumentiert explizit, dass Website-
  Objekte nicht in den Workspace-Overlays leben. `WEBSITE_NAMESPACE=website-staging`
  im Env-Profil bestätigt die Trennung.
- **D2 Secrets über das bestehende SealedSecrets-Artefakt**, nicht Dev-Seeds:
  namespace-scoped (strict) gesealed auf die Staging-Namespaces; Muster identisch zu den
  Brands (Kopie in den Artefaktbaum + eigene Kustomization).
- **D3 Kein dependsOn auf die Website-Kustomization.** Wie bei den Brands hängt nur
  `flux-infra-controllers`; die CronJobs curlen zur Laufzeit (eventual), und ein hartes
  Health-Gate auf fremde Infrastruktur ist als Anti-Pattern dokumentiert
  (ks-mentolder.yaml, T002313).
- **D4 Prune-Risiko bewusst akzeptiert:** Die 63d-alten Manuell-Apply-Objekte können vom
  aktuellen Stand abweichen; `prune: true` räumt Altbestände weg. Staging ist
  Testumgebung, Datenverlust-Risiko wurde im Vorgängerplan explizit verneint
  (nur DDL, keine Löschung).
- **D5 Spec-Ziel ist `openspec/specs/fleet-operations.md`** — dort liegen bereits die
  ENV=staging-Auflösung und die Wildcard-Certificate-Anforderung an `prod-fleet/staging`.

## Risiken

- DNS/TLS außerhalb des Repos: `*.staging.korczewski.de` muss für ACME DNS-01 auflösen;
  sonst bleibt die Website-Ingress-Zertifikatsausstellung hängen. CronJobs curlen aber
  intern HTTP gegen den Service — das Akzeptanzkriterium (scheduled-publish exit 0)
  hängt nicht am Public-DNS.
- Offline-Render ohne exportierte Digests scheitert am Placeholder-Guard — gleicher
  Vertrag wie bei den Brands (T004041), durch die neuen Placeholder-Einträge im
  staging-Profil dokumentiert abgedeckt.
