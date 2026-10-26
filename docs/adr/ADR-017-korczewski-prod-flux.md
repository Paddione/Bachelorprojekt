# ADR-017: korczewski-prod bekommt einen eigenen Flux-Pfad statt des fleet-Overlays

**Status:** Accepted  
**Datum:** 2026-10-26  
**Ticket / Feature:** korczewski-prod  
**Related:** [ADR-016](ADR-016-devmesh-eigenes-flux.md), [ADR-015](ADR-015-website-basis-in-k3d.md), [ADR-008](ADR-008-local-k3s-dev-mesh.md)

## Kontext

Der Prod-Slot korczewski hat keinen erreichbaren Cluster. `environments/korczewski.yaml` zeigt mit
`context: fleet`, `overlay: prod-fleet/korczewski` und `secrets_ref: sealed-secrets/korczewski.yaml`
auf einen abgebauten Pfad; `flux/clusters/fleet/ks-korczewski.yaml` steht auf `suspend: true`, und
`flux/clusters/fleet/DECOMMISSIONED.md` erklärt den Pfad für beendet. Wer `korczewski.de` ausliefern
will, findet heute keinen GitOps-Weg, nur historische `prod-fleet/*`-Overlays ohne Ziel-Cluster.

Vorbild ist der devmesh-Pfad aus [ADR-016](ADR-016-devmesh-eigenes-flux.md): eine eigene
`FluxInstance`, getrennte Kustomizations mit `dependsOn` und ein eigenes, signiertes OCI-Artefakt
`ghcr.io/paddione/devmesh-manifests`.

Der Audit dieses Pfads hat drei Befunde geliefert, die ein Prod-Cluster nicht erben darf:

- **C1 — GitOps-Lücke:** 12 Deployments und 7 CronJobs im Namespace `workspace` sind live, aber in
  keinem Manifest; sie tragen nur `kubectl.kubernetes.io/last-applied-configuration`.
- **C2 — Tenant-RBAC:** `flux/clusters/devmesh/tenant-rbac.yaml` bindet `devmesh-tenant-deploy` an
  `cluster-admin`, trotz `spec.cluster.multitenant: true`.
- **C3 — Frischcluster:** `environments/sealed-secrets/dev.yaml` versiegelt für `monitoring`,
  `workspace-office` und `website`, während das Artefakt nur `workspace` anlegt. Auf einem leeren
  Cluster scheitert damit die `secrets`-Kustomization und über `dependsOn` auch der Workspace-Pfad.

Daraus folgt die Entscheidung: `korczewski-prod` ist kein umgebogenes Overlay, sondern ein eigener,
host-agnostischer Lieferketten-Pfad mit eigenem Artefakt, eigener Flux-Instanz, eigenem engen
RBAC-Satz und eigenem SealedSecrets-Key. Der Cluster selbst (Hardware, k3s, Flux-Bootstrap, Storage,
Ingress-Controller) bleibt Vorbedingung eines Runbooks und ist nicht Gegenstand dieses ADR.

## Entscheidungen

1. **D1 — Vier Sync-Pfade statt eines Monolithen:** `korczewski-prod-bootstrap`
   (`./cluster-bootstrap`, ausschließlich cluster-scoped Objekte), `korczewski-prod-platform`
   (`./platform`), `korczewski-prod-secrets` (`./secrets`) und `korczewski-prod-apps` (`./apps`),
   jede Kustomization mit eigenem ServiceAccount und `dependsOn` in dieser Reihenfolge. Begründung:
   genau die Mischung aus cluster- und namespaced Objekten unter `prune: true` hat auf devmesh
   `cluster-admin` erzwungen (C2).
2. **D2 — Kein `cluster-admin` für den Tenant:** `apps` und `secrets` erhalten ausschließlich
   namespaced `Role`/`RoleBinding` in `website-korczewski` und `workspace-korczewski`; der
   Bootstrap-Pfad erhält eine `ClusterRole` mit `resourceNames` auf `letsencrypt-korczewski-prod`,
   `default` (TLSStore) und die drei Bootstrap-RBAC-Objekte. Begründung: `multitenant: true` ist nur
   dann keine Behauptung, wenn die Rolle nicht mehr Rechte trägt als die Objektmenge ihres Pfads.
3. **D3 — Ein Render-Vertrag, zweite Instanz:** `scripts/korczewski-prod/render-stack.sh` spiegelt
   die Schnittstelle von `scripts/devmesh/render-stack.sh` (`--out <dir>`, stdout ohne `--out`) mit
   dem Layout `{cluster-bootstrap,platform,secrets,apps}` und fail-closed-Guards. Begründung: es
   entsteht kein zweiter Render-Mechanismus, sondern eine zweite Instanz desselben Vertrags, womit
   ADR-016 D3 gewahrt bleibt.
4. **D4 — Overlays referenzieren, nicht kopieren:** `korczewski-prod/website/` baut auf
   `prod-fleet/website-korczewski` (und damit über ADR-015 auf `k3d/website.yaml` plus
   `k3d/website-seller-config.yaml`), `korczewski-prod/auth/` baut Pocket ID direkt aus
   `k3d/pocket-id*.yaml`. Begründung: eine zweite Kopie der Basis-Manifeste wäre unmittelbarer Drift
   gegen die am 2026-10-21 festgeschriebene SSOT.
5. **D5 — Neuer SealedSecrets-Key, vier SealedSecrets:** `cert-manager/ipv64-api-key`,
   `workspace-korczewski/workspace-secrets`, `website-korczewski/website-secrets` und
   `website-korczewski/website-content-token`; das Keypair entsteht **vor** dem Cluster (Abweichung
   zu D5, design §6) als öffentliches Zertifikat `environments/certs/korczewski-prod.pem` plus
   git-crypt-verschlüsseltem privatem Schlüssel
   `environments/.secrets/sealed-secrets-key.korczewski-prod.yaml`, versiegelt offline mit
   `scripts/env-seal.sh --env korczewski-prod --reuse-cert`, und der Bootstrap importiert es vor dem
   ersten SealedSecret und prüft `kubeseal --fetch-cert` byte-gleich gegen das committete Zertifikat,
   weil `task env:fetch-cert` davor still umschlüsseln würde. Begründung: geteilter Ciphertext
   zwischen devmesh und prod würde einen Schlüssel über zwei Brands spannen, und die
   Namespace-Parität ist genau der Punkt, an dem C3 still gescheitert ist; die Vorab-Erzeugung ist
   nötig, weil der Ziel-Cluster bei der Ausführung noch nicht existiert (Q2) und D5 sonst nicht
   lieferbar wäre.
6. **D6 — Wildcard als Traefik-Default-TLSStore:** `Certificate korczewski-prod-wildcard-tls` und
   `TLSStore default` in `kube-system` (Muster `dev-local/cluster/tls.yaml`) ersetzen den
   `tls-sync`-CronJob und `reflector` aus dem fleet-Overlay. Begründung: ein Secret-Kopierer bräuchte
   eine `ClusterRole` mit clusterweitem `secrets`-Lesezugriff, also genau die Rolle, die D2
   ausschließt.
7. **D7 — Images digest-gepinnt:** der Website-Patch ersetzt den mutablen Tag aus
   `k3d/website.yaml:252` durch `@sha256:`, und im gerenderten Baum endet jeder `image:`-Wert auf
   `@sha256:`. Begründung: ein mutabler Tag macht den Baum nicht reproduzierbar und entwertet die
   Signatur des Artefakts, die nur das Artefakt selbst bindet, nicht das nachgeladene Image.
8. **D8 — Artefakt öffentlich, aber identitätsgebunden:** `ghcr.io/paddione/korczewski-prod-manifests`
   ist public, und `OCIRepository.verify.matchOIDCIdentity` pinnt Issuer
   `https://token.actions.githubusercontent.com` sowie Subject
   `^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-korczewski-prod-artifact\.yml@refs/heads/main$`.
   Begründung: ADR-016 D1 verlangt ein privates Artefakt, der Pull-Pfad ist aber faktisch public
   (`devmesh-manifests` antwortet anonym mit HTTP 200), sodass die gepinnte Workflow-Identität die
   Eigenschaft ist, die den Inhalt wirklich bindet.

## Abweichungen zu ADR-016

### (a) Öffentliches Artefakt statt privatem (ADR-016 D1)

ADR-016 D1 sagt „eigenes, privates und signiertes OCI-Artefakt“; der Pull ist real anonym
(`devmesh-manifests` HTTP 200, `fleet-manifests` 401, Stand 2026-10-26). Kompensiert wird das über
die gepinnte cosign-Identität aus D8: Issuer `https://token.actions.githubusercontent.com`, Subject
`render-korczewski-prod-artifact.yml@refs/heads/main`, `OCIRepository` ohne `secretRef`. Beleg:
`flux/clusters/korczewski-prod/oci-source.yaml`. Vertraulichkeit war ohnehin keine Zusage, weil
dieselben Manifeste öffentlich im Repository liegen; gewonnen wird ein `pullSecret`-freier
Bootstrap.

### (b) `distribution.version` gepinnt statt `2.x`

devmesh fährt `flux/clusters/devmesh/flux-instance.yaml` mit `"2.x"`; korczewski-prod pinnt einen
konkreten Minor (`2.9.x`). Ein Prod-Cluster soll nur durch einen bewussten Commit einen
Minor-Sprung machen, nicht durch einen Controller-Rollout, der kein Artefakt geändert hat. Beleg:
`flux/clusters/korczewski-prod/flux-instance.yaml`.

### (c) Cluster-scoped Objekte im eigenen Bootstrap-Pfad statt im Platform-Pfad

ADR-016 D3 führt Plattform-Manifeste (cert-manager, lego-webhook, sealed-secrets-Controller, TLS)
unter `dev-local/platform/`. korczewski-prod trennt `cluster-bootstrap` (ClusterIssuer, TLSStore,
Bootstrap-`ClusterRole(Binding)`, CRD-Leserechte) von `platform` (HelmRepositories, HelmReleases).
Ein `prune: true`-Pfad mit cluster- und namespaced Objekten ist genau der Grund für C2; erst die
Trennung erlaubt `resourceNames`. Beleg: `korczewski-prod/cluster-bootstrap/`,
`korczewski-prod/platform/`.

### (d) Kein `cluster-admin` für den Tenant

`flux/clusters/devmesh/tenant-rbac.yaml` bindet `devmesh-tenant-deploy` als
„Uebergangs-cluster-admin“ an `cluster-admin` (C2). korczewski-prod startet mit der engen Form, weil
ein frisch gebootstrappter Cluster keine gewachsene Objektmenge hat, die eine breite Rolle
rechtfertigen würde. Beleg: `flux/clusters/korczewski-prod/tenant-rbac.yaml`,
`korczewski-prod/cluster-bootstrap/rbac.yaml`.

## Abgrenzung zu T002479 und zur :latest-Ausnahme

### Freeze-Fortschreibung (T002479)

`AGENTS.md` führt den korczewski-Workspace als FROZEN und die Prod-Verdrahtung aus T901440
(`flux-website-korczewski`, `flux-korczewski-auth`) als „`suspend: true`, no go-live“. ADR-017
schreibt davon genau eine Teilmenge fort: das Go-live-Verbot für **Website + Pocket ID auf einem
eigenen Ziel-Cluster**. Nicht berührt: der Workspace-Stack (Nextcloud, Brett, Collabora,
`ks-korczewski.yaml` / `ks-jobs-korczewski.yaml`), die Namespaces `workspace` und `website` auf
`fleet` und jede Datei unter `flux/clusters/fleet/**` — dort bleibt alles `suspend: true`, dieser
Pfad synct nichts in den `fleet`-Cluster. Begründung: T002479 meint den fleet-Pfad; ein eigener,
host-agnostischer Cluster ist kein Wiederhochfahren des abgebauten Standorts.

### Digest-Policy gegen die :latest-Ausnahme

`AGENTS.md` nennt die Website (neben Brett, Mentolder-Web u. a.) unter den `:latest`-Digest-Ausnahmen.
Die Ausnahme gilt unverändert für die bestehenden Pfade (`k3d/*.yaml`, `dev-local/**`,
`prod-fleet/**`); D7 verschärft ausschließlich `korczewski-prod/**`. Begründung: der Grund der
Ausnahme — schnelle Dev-Iteration gegen `:latest` — existiert für einen frisch aufgesetzten
Prod-Cluster nicht, und weil `test_images_are_digest_pinned` nur den `korczewski-prod`-Baum prüft,
bleibt ein `:latest` in `k3d/website.yaml` policy-konform.

## Folgen

### Was einfacher wird

Kein `kubectl apply` ist nötig, der Cluster baut sich aus `flux-instance.yaml` plus Artefakt; der
C3-Fall (SealedSecret-Namespace ohne Namespace) fällt im Render-Gate auf statt als `False`-
Kustomization im Cluster; die RBAC ist ab dem ersten Sync eng, es gibt keine Übergangsrolle
nachzuziehen; ein öffentliches Artefakt braucht kein `imagePullSecret`, der Bootstrap-Commit bleibt
bei zwei Dateien.

### Was teurer wird

Zwei Render-Skripte mit identischem Vertrag — jede Änderung an `--out` oder den fail-closed-Guards
muss in `scripts/devmesh/render-stack.sh` und `scripts/korczewski-prod/render-stack.sh` doppelt
nachgezogen werden, der gemeinsame Kern `scripts/lib/render-stack-core.sh` ist bewusst nicht Teil
dieses Features; jeder Prod-Rollout braucht einen Digest-Bump (D7), ein neuer `:latest`-Push löst
nichts mehr aus; ein fehlender `TLSStore`-Default kostet den Rückfallpfad aus `## Risiken`; jeder
weitere Tenant braucht einen eigenen `env-seal.sh`-Durchlauf gegen seinen Controller.

## Risiken

- **Traefik-Version ohne `TLSStore`-Default.** Rückfallebene ist ein `Certificate` pro Namespace mit
  `secretName`-Bezug im Ingress — ohne clusterweiten Secret-Reader.
- **Öffentliches Artefakt.** Der Inhalt ist für jeden lesbar und pullbar, weshalb das Weglassen der
  Signaturprüfung keine Option ist.
- **Geteilte SSOT.** `k3d/website.yaml` bleibt geteilte SSOT nach ADR-015; eine Änderung dort bricht
  den Prod-Render, deshalb läuft der Render-Guard in CI und nicht nur lokal.

## Guards

Zwei Testdateien pinnen die Invarianten dieses ADR offline:
`tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py` (Flux-Instanz-Isolation,
cosign-Identitätsanker, Digest-Pins, Verbot der breiten Cluster-Rolle) und
`tests/py/spec/korczewski-prod/test_render_guards.py` (Render-Layout, Fremd-Referenzen,
Cluster-Scope-Trennung, SealedSecret-/Namespace-Parität).

## Nicht entschieden

Cluster-Hardware und Topologie (Hosts, Anzahl, CIDRs — nur die Werte aus
`environments/korczewski-prod.yaml` sind Pflicht-Input); Storage (StorageClass für
`pocket-id-data`, die `shared-db`-Instanz mit `website_massage`) — beides Vorbedingung des
Bootstrap-Runbooks, nicht des Artefakts; Monitoring, Alerting, Logging und Backup/Restore der PVCs;
die Sanierung der devmesh-RBAC (C2), der C1-Fix auf devmesh, die Migration der historischen
`prod-fleet/*`-Overlays und der tote `.github/workflows/render-fleet-artifact.yml`; ein gemeinsamer
Render-Kern unter `scripts/lib/`.
