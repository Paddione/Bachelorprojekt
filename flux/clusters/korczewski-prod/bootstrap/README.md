# korczewski-prod — Vorbedingungen des Ziel-Clusters

Dieses Runbook beschreibt, **was der Cluster haben muss, bevor der erste Sync
grün werden kann**, und **was das Artefakt selbst liefert**. Der Plan
`korczewski-prod` (`.agents/plans/korczewski-prod/`) baut den Cluster nicht; er
macht den Bootstrap zur dokumentierten Vorbedingung statt zur stillen Annahme
(design §9, Entscheidung Q2).

Die Sollwerte kommen aus `environments/korczewski-prod.yaml`, nicht aus diesem
Text: die Befehle lesen sie per `yq` aus der Env-Datei. Alle Befehle laufen gegen
`--context korczewski-prod`.

Was das Artefakt liefert (nach Punkt 7 automatisch): die drei Namespaces
`cert-manager`, `workspace-korczewski`, `website-korczewski`, die drei
ServiceAccounts samt Rollen in `flux-system`, die ClusterRole der Bootstrap-Stufe,
den `ClusterIssuer`, das Wildcard-`Certificate` mit `TLSStore default` und die
vier SealedSecrets. Alles Weitere ist Vorbedingung und **kein**
`kubectl apply` aus diesem Verzeichnis.

## Vorbedingungen

1. **k3s-CIDRs.** Pod- und Service-CIDR müssen zu den NetworkPolicies passen,
   sonst greifen sie ins Leere. Sollwerte lesen, Ist-Werte vergleichen:

   ```bash
   yq -r '.env_vars.POD_CIDR, .env_vars.SERVICE_CIDR' environments/korczewski-prod.yaml
   kubectl --context korczewski-prod get nodes \
     -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.podCIDR}{"\n"}{end}'
   kubectl --context korczewski-prod get svc kubernetes \
     -o jsonpath='{.spec.clusterIP}{"\n"}'
   ```

   Die Cluster-IP von `svc/kubernetes` muss im Service-CIDR liegen (`10.43.0.0/16`),
   der Pod-CIDR muss `10.42.0.0/16` sein. Abweichung = Gate verletzt.

2. **StorageClass** für das Pocket-ID-Datenverzeichnis (`pocket-id-data`):
   Longhorn muss vorhanden und die Default-Class gesetzt sein.

   ```bash
   kubectl --context korczewski-prod get storageclass longhorn -o wide
   kubectl --context korczewski-prod get storageclass \
     -o jsonpath='{range .items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")]}{.metadata.name}{"\n"}{end}'
   ```

3. **Traefik-CRDs und IngressClass** — der Apps-Pfad rendert IngressRoutes, der
   Bootstrap-Pfad einen `TLSStore`.

   ```bash
   kubectl --context korczewski-prod get crd ingressroutes.traefik.io middlewares.traefik.io tlsstores.traefik.io
   kubectl --context korczewski-prod get ingressclass traefik
   ```

4. **cert-manager und lego-webhook — hartes Gate.** Der Bootstrap-Pfad legt einen
   `ClusterIssuer` an und hängt damit an diesen CRDs; fehlt cert-manager, bleibt
   `korczewski-prod-bootstrap` rot und `korczewski-prod-platform` wartet über
   `dependsOn`. Wiederherstellung ist „Vorbedingung nachziehen, 2m-Retry
   abwarten", nicht „dependsOn lösen".

   ```bash
   kubectl --context korczewski-prod -n cert-manager get crd clusterissuers.cert-manager.io
   kubectl --context korczewski-prod -n cert-manager get svc lego-webhook
   kubectl --context korczewski-prod -n cert-manager get deploy
   ```

5. **sealed-secrets-Controller und Schlüsselbezug.** Die Reihenfolge ist bindend
   (design §6, „Abweichung von D5"): der Controller erzeugt ohne Import ein
   eigenes Keypair, darum muss das **vorab** erzeugte Keypair **vor** dem ersten
   SealedSecret eingespielt werden. Sonst sind die vier Dokumente aus
   `environments/sealed-secrets/korczewski-prod.yaml` unentschlüsselbar und
   müssen neu versiegelt werden.

   ```bash
   kubectl --context korczewski-prod -n sealed-secrets get deploy sealed-secrets
   kubectl --context korczewski-prod -n sealed-secrets get svc sealed-secrets

   # Keypair einspielen (Datei ist git-crypt-verschluesselt):
   git-crypt unlock
   kubectl --context korczewski-prod apply -f environments/.secrets/sealed-secrets-key.korczewski-prod.yaml
   kubectl --context korczewski-prod -n sealed-secrets rollout restart deploy sealed-secrets
   kubectl --context korczewski-prod -n sealed-secrets rollout status deploy sealed-secrets

   # Byte-Gleichheit: der Controller muss genau das committete Zertifikat ausliefern.
   diff <(kubeseal --controller-name=sealed-secrets --controller-namespace=sealed-secrets \
            --context korczewski-prod --fetch-cert) \
        environments/certs/korczewski-prod.pem
   ```

   `diff` ohne Ausgabe = Anker steht. Erst **danach** darf
   `task env:fetch-cert ENV=korczewski-prod` laufen; vorher würde es das
   committete Zertifikat mit einem fremden Keypair überschreiben und die vier
   SealedSecrets still umschlüsseln. Ein erneutes
   `task env:seal ENV=korczewski-prod` ist nur nach bewusster Rotation nötig.

6. **PostgreSQL mit Datenbank und Rolle `website_massage`**, erreichbar unter
   `shared-db.workspace-korczewski.svc.cluster.local:5432`. Die Datenbank selbst
   ist **nicht** Teil des Artefakts (design §6); ohne sie startet weder die
   Website noch Pocket ID.

   ```bash
   kubectl --context korczewski-prod -n workspace-korczewski get svc shared-db
   kubectl --context korczewski-prod -n workspace-korczewski run pg-probe --rm -i --restart=Never \
     --image=postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 \
     -- psql -h shared-db -U website_massage -d website_massage \
        -c 'select current_database(), current_user'
   ```

7. **FluxInstance per Bootstrap-Commit.** Die Instanz kann sich nicht selbst
   deployen; sie wird einmalig von Hand appliziert. Danach übernimmt die vom
   Operator erzeugte Root-Kustomization `flux-system` den Pfad
   `flux/clusters/korczewski-prod` und damit Source, Kind-Kustomizations und RBAC.

   ```bash
   kubectl --context korczewski-prod apply -f flux/clusters/korczewski-prod/flux-instance.yaml
   flux --context korczewski-prod get kustomizations -A
   flux --context korczewski-prod get sources oci
   ```

   Erwartung: vier Pfade (`flux-system` als Root plus
   `korczewski-prod-bootstrap`, `-platform`, `-secrets`, `-apps`) und genau eine
   OCIRepository `korczewski-prod-manifests`.

8. **Abschlussprüfung.** Dieselbe Kustomization-Abfrage wie in Punkt 7 muss für
   alle Kind-Pfade `Ready: True` zeigen; zusätzlich die Namespaces und die
   SealedSecrets prüfen:

   ```bash
   kubectl --context korczewski-prod get ns
   kubectl --context korczewski-prod get sealedsecrets -A
   ```

   Erwartung: `cert-manager`, `workspace-korczewski` und `website-korczewski`
   sind `Active`, und es liegen genau vier SealedSecrets in genau diesen drei
   Namespaces (`cert-manager/ipv64-api-key`,
   `workspace-korczewski/workspace-secrets`,
   `website-korczewski/website-secrets`,
   `website-korczewski/website-content-token`).

## Zwei weitere Vorbedingungen ohne Nummer

Diese beiden Punkte stehen bewusst **nicht** in der nummerierten Liste oben: die
Nummerierung 1–8 ist der stabile Anker der Abschlussprüfung aus Punkt 8 und wird
hier nicht verschoben. Beide folgen aus dem Website-Overlay
(`korczewski-prod/website/`), nicht aus den Manifesten dieses Verzeichnisses.

- **HTTP-Redirect `web` → `websecure` in Traefik (statische Konfiguration).**
  Alle Router der Website hängen nur an `websecure` — `website-prod`,
  `website-prod-astro` und der gepatchte Apex (`korczewski-prod/website/ingress.yaml`
  und `korczewski-prod/website/kustomization.yaml`); derselbe Redirect trägt den
  Auth-Router. Repo-weit existiert dafür keine Konfiguration (`grep -rn
  "redirectTo"` liefert keinen Treffer), es ist also statische
  Traefik-Konfiguration und **kein** Manifest dieses Artefakts. Bei k3s gehört
  sie in die `HelmChartConfig traefik` (Namespace `kube-system`):

  ```yaml
  additionalArguments:
    - --entrypoints.web.http.redirections.entrypoint.to=websecure
    - --entrypoints.web.http.redirections.entrypoint.scheme=https
    - --entrypoints.web.http.redirections.entrypoint.status=301
    - --entrypoints.web.http.redirections.entrypoint.priority=2147483647
  ```

  Prüfen:

  ```bash
  kubectl --context korczewski-prod -n kube-system get helmchartconfig traefik -o yaml
  ```

  Ohne diese Zeilen ist `http://web.korczewski.de` nicht erreichbar statt
  umgeleitet; `https://` funktioniert unabhängig davon.

- **`ghcr-pull-secret` im Namespace `website-korczewski`.** `k3d/website.yaml`
  behält `imagePullSecrets: [{name: ghcr-pull-secret}]`. Im fleet-Overlay deckte
  der `tls-sync`-CronJob den Namen mit ab; der entfällt hier (design D6), also
  muss der Secret beim Bootstrap entstehen — oder das Paket ist öffentlich
  lesbar, dann bleibt der Eintrag wirkungslos. Fehlt beides, bleibt der Pod in
  `ImagePullBackOff`.

  ```bash
  kubectl --context korczewski-prod -n website-korczewski get secret ghcr-pull-secret
  ```

## Was ausdrücklich nicht hier entsteht

`sealed-secrets` ist bewusst kein Artefakt-Inhalt: dort liegt kein SealedSecret,
und Namespace samt Controller gehören zu Vorbedingung 5. `cert-manager` ist durch
Vorbedingung 4 schon da — das Artefakt deklariert den Namespace trotzdem, damit
der Paritätstest aus design §10 (SealedSecret-Namespaces ⊆ angelegte Namespaces)
ohne Ausnahmeliste prüfbar bleibt.

Kein Objekt dieses Verzeichnisses wird von Hand appliziert außer der
FluxInstance aus Punkt 7. Die Namespaces, ServiceAccounts, Rollen und Bindings
kommen aus `tenant-rbac.yaml` über die Root-Kustomization.
