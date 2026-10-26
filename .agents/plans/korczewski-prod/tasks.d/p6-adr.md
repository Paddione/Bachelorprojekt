# p6 — ADR-017

## Task 1: ADR-017 anlegen — Kopfzeile, Kontext, Entscheidungen D1–D8

**Files:** `docs/adr/ADR-017-korczewski-prod-flux.md`

Neue Datei nach dem Kopfzeilen-Schema von `docs/adr/ADR-016-devmesh-eigenes-flux.md`
und `docs/adr/ADR-015-website-basis-in-k3d.md`. Der Kopf besteht aus fünf Zeilen in
dieser Reihenfolge:

- H1 `# ADR-017: korczewski-prod bekommt einen eigenen Flux-Pfad statt des fleet-Overlays`
- `**Status:** Accepted`
- `**Datum:** 2026-10-26`
- `**Ticket / Feature:** korczewski-prod`
- `**Related:**` mit relativen Links auf `ADR-016-devmesh-eigenes-flux.md`,
  `ADR-015-website-basis-in-k3d.md` und `ADR-008-local-k3s-dev-mesh.md`.

Bewusst `**Related:**` statt `**Supersedes:**`: ADR-017 löst keinen der drei Vorgänger
ab. ADR-016 bleibt für devmesh gültig, ADR-015 bleibt die SSOT-Regel für die
Website-Basis-Manifeste, ADR-008 bleibt der Beleg für den `devmesh`-Context und das
Tailnet. ADR-017 beerbt die drei und weicht an genau einer Stelle ab (Artefakt
öffentlich statt privat, ADR-016 D1), was der Abschnitt „Abweichungen zu ADR-016" in
Task 2 ausführt.

Abschnitt `## Kontext` belegt den Ausgangsstand mit Dateipfaden, ohne neue Messung zu
behaupten:

1. Der Prod-Slot korczewski hat keinen erreichbaren Cluster. `environments/korczewski.yaml`
   zeigt mit `context: fleet`, `overlay: prod-fleet/korczewski` und
   `secrets_ref: sealed-secrets/korczewski.yaml` auf einen abgebauten Pfad;
   `flux/clusters/fleet/ks-korczewski.yaml` steht `suspend: true` und
   `flux/clusters/fleet/DECOMMISSIONED.md` erklärt den Pfad für beendet. Wer
   `korczewski.de` ausliefern will, findet heute keinen GitOps-Weg, nur historische
   `prod-fleet/*`-Overlays ohne Ziel-Cluster.
2. Vorbild ist der devmesh-Pfad aus ADR-016 (`FluxInstance`, drei Kustomizations,
   eigenes signiertes OCI-Artefakt `ghcr.io/paddione/devmesh-manifests`).
3. Der Audit dieses Pfads hat drei Befunde geliefert, die ein Prod-Cluster nicht erben
   darf: **C1** — 12 Deployments und 7 CronJobs im Namespace `workspace` sind live, aber
   in keinem Manifest (nur `kubectl.kubernetes.io/last-applied-configuration`);
   **C2** — `flux/clusters/devmesh/tenant-rbac.yaml` bindet `devmesh-tenant-deploy` an
   `cluster-admin`, trotz `spec.cluster.multitenant: true`; **C3** —
   `environments/sealed-secrets/dev.yaml` versiegelt für `monitoring`,
   `workspace-office` und `website`, während das Artefakt nur `workspace` anlegt, was auf
   einem leeren Cluster die `secrets`-Kustomization und über `dependsOn` auch den
   Workspace-Pfad blockiert.
4. Daraus folgt die Entscheidung: `korczewski-prod` ist kein umgebogenes Overlay, sondern
   ein eigener, host-agnostischer Lieferketten-Pfad mit eigenem Artefakt, eigener
   Flux-Instanz, eigenem engen RBAC-Satz und eigenem SealedSecrets-Key. Der Cluster
   selbst (Hardware, k3s, Flux-Bootstrap, Storage, Ingress-Controller) bleibt Vorbedingung
   eines Runbooks und ist nicht Gegenstand dieses ADR.

Abschnitt `## Entscheidungen` ist eine nummerierte Liste mit genau acht Einträgen in der
Form `1. **D1 — <Titel>:** <Beschreibung> … Begründung: <ein Satz>.` — je Eintrag eine
Beschreibung und genau ein Begründungssatz. Inhalt aus `design.md` D1–D8:

1. **D1 — Vier Sync-Pfade statt eines Monolithen:** `korczewski-prod-bootstrap`
   (`./cluster-bootstrap`, nur cluster-scoped Objekte), `korczewski-prod-platform`
   (`./platform`), `korczewski-prod-secrets` (`./secrets`) und `korczewski-prod-apps`
   (`./apps`), jede Kustomization mit eigenem ServiceAccount und `dependsOn` in dieser
   Reihenfolge. Begründung: genau die Mischung aus cluster- und namespaced Objekten unter
   `prune: true` hat auf devmesh `cluster-admin` erzwungen (C2).
2. **D2 — Kein `cluster-admin` für den Tenant:** `apps` und `secrets` erhalten
   ausschließlich namespaced `Role`/`RoleBinding` in `website-korczewski` und
   `workspace-korczewski`; der Bootstrap-Pfad erhält eine `ClusterRole` mit
   `resourceNames` auf `letsencrypt-korczewski-prod`, `default` (TLSStore) und die drei
   Bootstrap-RBAC-Objekte. Begründung: `multitenant: true` ist nur dann keine Behauptung,
   wenn die Rolle nicht mehr Rechte trägt als die Objektmenge ihres Pfads.
3. **D3 — Ein Render-Vertrag, zweite Instanz:** `scripts/korczewski-prod/render-stack.sh`
   spiegelt die Schnittstelle von `scripts/devmesh/render-stack.sh` (`--out <dir>`, stdout
   ohne `--out`) mit dem Layout `{cluster-bootstrap,platform,secrets,apps}` und
   fail-closed-Guards. Begründung: es entsteht kein zweiter Render-Mechanismus, sondern
   eine zweite Instanz desselben Vertrags, womit ADR-016 D3 gewahrt bleibt.
4. **D4 — Overlays referenzieren, nicht kopieren:** `korczewski-prod/website/` baut auf
   `prod-fleet/website-korczewski` (und damit über ADR-015 auf `k3d/website.yaml` plus
   `k3d/website-seller-config.yaml`), `korczewski-prod/auth/` baut Pocket ID direkt aus
   `k3d/pocket-id*.yaml`. Begründung: eine zweite Kopie der Basis-Manifeste wäre
   unmittelbarer Drift gegen die 2026-10-21 festgeschriebene SSOT.
5. **D5 — Neuer SealedSecrets-Key, vier SealedSecrets:** `cert-manager/ipv64-api-key`,
   `workspace-korczewski/workspace-secrets`, `website-korczewski/website-secrets` und
   `website-korczewski/website-content-token`, versiegelt mit
   `scripts/env-seal.sh --env korczewski-prod` gegen den Controller des Ziel-Clusters.
   Begründung: geteilter Ciphertext zwischen devmesh und prod würde einen Schlüssel über
   zwei Brands spannen, und die Namespace-Parität ist genau der Punkt, an dem C3 still
   gescheitert ist.
6. **D6 — Wildcard als Traefik-Default-TLSStore:** `Certificate
   korczewski-prod-wildcard-tls` und `TLSStore default` in `kube-system` (Muster
   `dev-local/cluster/tls.yaml`) ersetzen `tls-sync`-CronJob und `reflector` aus dem
   fleet-Overlay. Begründung: ein Secret-Kopierer bräuchte eine `ClusterRole` mit
   clusterweitem `secrets`-Lesezugriff, also genau die Rolle, die D2 ausschließt.
7. **D7 — Images digest-gepinnt:** der Website-Patch ersetzt den mutablen Tag aus
   `k3d/website.yaml:252` durch `@sha256:`, und im gerenderten Baum endet jeder
   `image:`-Wert auf `@sha256:`. Begründung: ein mutabler Tag macht den Baum nicht
   reproduzierbar und entwertet die Signatur des Artefakts, die nur das Artefakt selbst
   bindet, nicht das nachgeladene Image.
8. **D8 — Artefakt öffentlich, aber identitätsgebunden:** `ghcr.io/paddione/korczewski-prod-manifests`
   ist public, und `OCIRepository.verify.matchOIDCIdentity` pinnt Issuer
   `https://token.actions.githubusercontent.com` sowie Subject
   `^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-korczewski-prod-artifact\.yml@refs/heads/main$`.
   Begründung: ADR-016 D1 verlangt ein privates Artefakt, der Pull-Pfad ist aber faktisch
   public (`devmesh-manifests` antwortet anonym mit HTTP 200), sodass die gepinnte
   Workflow-Identität die Eigenschaft ist, die den Inhalt wirklich bindet.

S1: `docs/adr/ADR-017-korczewski-prod-flux.md` ist eine `.md`-Datei; `.md` steht nicht in
`s1.limits` aus `docs/code-quality/gates.yaml` und der Pfad ist nicht baselined — kein
Zeilenbudget für diesen Partial.

Verify: `grep -qE '^# ADR-017: .+' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF '**Status:** Accepted' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF '**Datum:** 2026-10-26' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF '**Ticket / Feature:** korczewski-prod' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qE '^\*\*Related:\*\*.*ADR-016.*ADR-015.*ADR-008' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF '## Kontext' docs/adr/ADR-017-korczewski-prod-flux.md && [ "$(grep -cE '^[0-9]+\. \*\*D[1-8] — ' docs/adr/ADR-017-korczewski-prod-flux.md)" -eq 8 ] && [ "$(grep -c 'Begründung' docs/adr/ADR-017-korczewski-prod-flux.md)" -ge 8 ] && echo ok`

## Task 2: Abweichungen, Folgen, Nicht entschieden — und Commit

**Files:** `docs/adr/ADR-017-korczewski-prod-flux.md`

Drei weitere Abschnitte in dieselbe Datei, danach ist ADR-017 vollständig.

`## Abweichungen zu ADR-016` mit genau vier Unterabschnitten in der Form
`### (a) <Titel>` bis `### (d) <Titel>`, jeder mit einer Begründung und dem Belegpfad:

- **(a) Öffentliches Artefakt statt privatem (ADR-016 D1).** ADR-016 D1 sagt „eigenes,
  privates und signiertes OCI-Artefakt"; der Pull ist real anonym (`devmesh-manifests`
  HTTP 200, `fleet-manifests` 401, Stand 2026-10-26). Kompensiert wird das über die
  gepinnte cosign-Identität aus D8: Issuer `https://token.actions.githubusercontent.com`,
  Subject `render-korczewski-prod-artifact.yml@refs/heads/main`, `OCIRepository` ohne
  `secretRef`. Vertraulichkeit war ohnehin keine Zusage, weil dieselben Manifeste
  öffentlich im Repository liegen; gewonnen wird ein `pullSecret`-freier Bootstrap.
- **(b) `distribution.version` gepinnt statt `2.x`.** devmesh fährt
  `flux/clusters/devmesh/flux-instance.yaml` mit `"2.x"`; korczewski-prod pinnt einen
  konkreten Minor (`2.9.x`). Ein Prod-Cluster soll nur durch einen bewussten Commit einen
  Minor-Sprung machen, nicht durch einen Controller-Rollout, der kein Artefakt geändert hat.
- **(c) Cluster-scoped Objekte im eigenen Bootstrap-Pfad statt im Platform-Pfad.** ADR-016
  D3 führt Plattform-Manifeste (cert-manager, lego-webhook, sealed-secrets-Controller, TLS)
  unter `dev-local/platform/`. korczewski-prod trennt `cluster-bootstrap` (ClusterIssuer,
  TLSStore, Bootstrap-`ClusterRole(Binding)`, CRD-Leserechte) von `platform`
  (HelmRepositories, HelmReleases). Ein `prune: true`-Pfad mit cluster- und namespaced
  Objekten ist genau der Grund für C2; erst die Trennung erlaubt `resourceNames`.
- **(d) Kein `cluster-admin` für den Tenant.** `flux/clusters/devmesh/tenant-rbac.yaml`
  bindet `devmesh-tenant-deploy` als „Uebergangs-cluster-admin" an `cluster-admin` (C2).
  korczewski-prod startet mit der engen Form, weil ein frisch gebootstrappter Cluster
  keine gewachsene Objektmenge hat, die eine breite Rolle rechtfertigen würde.

`## Folgen` mit zwei Unterabschnitten. „Was einfacher wird": kein `kubectl apply` nötig,
der Cluster baut sich aus `flux-instance.yaml` plus Artefakt; der C3-Fall
(SealedSecret-Namespace ohne Namespace) fällt im Render-Gate auf statt als `False`-
Kustomization im Cluster; die RBAC ist ab dem ersten Sync eng, es gibt keine
Übergangsrolle nachzuziehen; ein öffentliches Artefakt braucht kein `imagePullSecret`,
der Bootstrap-Commit bleibt bei zwei Dateien. „Was teurer wird": zwei Render-Skripte mit
identischem Vertrag — jede Änderung an `--out` oder den fail-closed-Guards muss in
`scripts/devmesh/render-stack.sh` und `scripts/korczewski-prod/render-stack.sh` doppelt
nachgezogen werden, der gemeinsame Kern `scripts/lib/render-stack-core.sh` ist bewusst
nicht Teil dieses Features; jeder Prod-Rollout braucht einen Digest-Bump (D7), ein neuer
`:latest`-Push löst nichts mehr aus; ein fehlender `TLSStore`-Default kostet den
Rückfallpfad aus `## Risiken`; jeder weitere Tenant braucht einen eigenen
`env-seal.sh`-Durchlauf gegen seinen Controller.

`## Risiken` mit drei Einträgen: Traefik-Version ohne `TLSStore`-Default — Rückfallebene
ist ein `Certificate` pro Namespace mit `secretName`-Bezug im Ingress, ohne clusterweiten
Secret-Reader; öffentliches Artefakt — Inhalt ist für jeden lesbar und pullbar, weshalb
das Weglassen der Signaturprüfung keine Option ist; `k3d/website.yaml` bleibt geteilte
SSOT nach ADR-015, eine Änderung dort bricht den Prod-Render, deshalb läuft der
Render-Guard in CI und nicht nur lokal.

`## Guards` mit den beiden Testdateien, die die Invarianten dieses ADR offline pinnen:
`tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py` (Flux-Instanz-Isolation,
cosign-Identitätsanker, Digest-Pins, `cluster-admin`-Verbot) und
`tests/py/spec/korczewski-prod/test_render_guards.py` (Render-Layout, Fremd-Referenzen,
Cluster-Scope-Trennung, SealedSecret-/Namespace-Parität).

`## Nicht entschieden`: Cluster-Hardware und Topologie (Hosts, Anzahl, CIDRs — nur die
Werte aus `environments/korczewski-prod.yaml` sind Pflicht-Input); Storage (StorageClass
für `pocket-id-data`, die `shared-db`-Instanz mit `website_massage`) — beides Vorbedingung
des Bootstrap-Runbooks, nicht des Artefakts; Monitoring, Alerting, Logging und
Backup/Restore der PVCs; die Sanierung der devmesh-RBAC (C2), der C1-Fix auf devmesh, die
Migration der historischen `prod-fleet/*`-Overlays und der tote
`.github/workflows/render-fleet-artifact.yml`; ein gemeinsamer Render-Kern unter
`scripts/lib/`.

Index: im Repo existiert kein ADR-Index — `docs/adr/README.md` fehlt, `docs/README.md`
und `llms.txt` verlinken nur das Verzeichnis `docs/adr/` und nennen einzeln allein
ADR-008. Deshalb entfällt eine Index-Zeile und `docs/adr/README.md` gehört nicht zu
diesem Task. Sollte beim Ausführen inzwischen ein `docs/adr/README.md` existieren, kommt
die Zeile `- [ADR-017](ADR-017-korczewski-prod-flux.md) — korczewski-prod Lieferkette`
in diesen Task und in denselben Commit.

Verify: `for k in "## Kontext" "## Entscheidungen" "## Abweichungen zu ADR-016" "## Folgen" "## Nicht entschieden"; do grep -qF "$k" docs/adr/ADR-017-korczewski-prod-flux.md || exit 1; done; [ "$(grep -cE '^### \([a-d]\) ' docs/adr/ADR-017-korczewski-prod-flux.md)" -eq 4 ] && grep -qF 'matchOIDCIdentity' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF 'distribution.version' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF 'cluster-admin' docs/adr/ADR-017-korczewski-prod-flux.md && grep -qF 'TLSStore' docs/adr/ADR-017-korczewski-prod-flux.md && echo ok`

Commit: `docs(adr): ADR-017 korczewski-prod Lieferkette`
