# p2-manifests — Service, Endpoints und Deployment-Konfiguration

_Rolle: impl · Ticket: T013909_

Der Cockpit-Pod erreicht den Host über einen benannten Service statt über eine IP im Deployment.
`host.k3d.internal` steht nicht zur Verfügung: der Name ist in diesem Cluster nicht auflösbar
(NXDOMAIN; `kube-system/coredns` führt in `NodeHosts` nur die beiden k3d-Knoten). Nachgetragen
würde er beim nächsten Cluster-Aufbau wieder verschwinden, weil k3d diese ConfigMap verwaltet.

## 1. `k3d/sdlc-stack/llm-proxy-host.yaml` anlegen

Ein Service ohne Selektor plus ein gleichnamiges Endpoints-Objekt. Kubernetes verknüpft beide über
den Namen; ohne Selektor bleibt das manuell gesetzte Endpoint bestehen, statt vom
Endpoints-Controller geleert zu werden.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-proxy-host
spec:
  ports:
    - name: http
      port: 18235
      targetPort: 18235
---
apiVersion: v1
kind: Endpoints
metadata:
  name: llm-proxy-host
subsets:
  - addresses:
      - ip: 172.23.0.1
    ports:
      - name: http
        port: 18235
```

Die Adresse ist das Gateway des k3d-Docker-Netzes. Sie steht hier an genau einer Stelle. In den
Kommentar der Datei gehört der Befehl, mit dem sie ermittelt wurde, damit sie nach einem
Cluster-Neuaufbau nachvollziehbar nachgezogen werden kann:

```bash
docker network inspect k3d-mentolder-dev -f '{{range .IPAM.Config}}{{.Gateway}}{{"\n"}}{{end}}'
```

Ebenfalls in den Kommentar: dass ein Service ohne Selektor hier Absicht ist, und dass eine falsche
Adresse sich als „Cockpit erreicht den Proxy nicht" zeigt, nicht als Manifest-Fehler.

## 2. `k3d/sdlc-stack/sdlc-console.yaml` erweitern

Zwei Umgebungsvariablen im Container `sdlc-console`:

```yaml
- name: LLM_PROXY_URL
  value: http://llm-proxy-host.workspace.svc.cluster.local:18235
- name: LLM_PROXY_ADMIN_TOKEN
  valueFrom:
    secretKeyRef:
      name: workspace-secrets
      key: LLM_PROXY_ADMIN_TOKEN
```

`LLM_PROXY_URL` enthält bewusst keine IP — S3 verbietet Host-Literale in `k3d/`, und der Service
existiert genau deshalb. Der `secretKeyRef` folgt dem Muster der bereits vorhandenen
`GITHUB_PAT`-Referenz auf `workspace-secrets` in derselben Datei.

## 3. `k3d/sdlc-stack/kustomization.yaml` ergänzen

`llm-proxy-host.yaml` in `resources` aufnehmen, direkt bei den anderen `sdlc-*`-Einträgen. Ohne
diese Zeile ist die Datei ein Orphan-Manifest und S4 schlägt an.

## 4. `k3d/secrets.yaml` ergänzen

Einen Dev-Wert `LLM_PROXY_ADMIN_TOKEN` in `workspace-secrets` aufnehmen, im Stil der vorhandenen
Einträge (`devvaultwardenadmin`, `devcronsecret12345`): ein klar als Entwicklungswert erkennbarer
String, kein zufällig aussehendes Geheimnis. Diese Datei trägt ausschließlich Dev-Werte; ein echtes
Token gehört niemals hinein.

Der Wert muss mit dem übereinstimmen, der auf Proxy-Seite in `~/.config/llm-proxy/proxy.env` steht
(p1, Schritt 4). Stimmen sie nicht überein, antwortet der Bridge-Listener mit HTTP 401, und das
Cockpit meldet einen unerreichbaren Proxy — ein Fehlerbild, das dem eines fehlenden Netzwerkpfads
sehr ähnlich sieht. Deshalb weist der Statusendpunkt in p3 die 401 gesondert aus.

Für Produktionsumgebungen entsteht hier **kein** Eintrag: das Cockpit ist entwicklungsseitig, die
SDLC-Routen fallen aus dem Prod-Build heraus, und ein Prod-Cluster hat kein k3d-Bridge-Netz.

## Definition of Done

```bash
task workspace:validate
kubectl --context k3d-mentolder-dev -n workspace get endpoints llm-proxy-host
kubectl --context k3d-mentolder-dev -n workspace exec deploy/sdlc-console -- printenv LLM_PROXY_URL
```

- `workspace:validate` läuft durch.
- Das Endpoints-Objekt trägt die Host-Adresse.
- Die Variable im Pod nennt den Servicenamen und enthält keine IP.
