# KI-Dienste standardmäßig deaktivieren und gezielt aktivieren

Fleet-Mentolder hält `whisper`, `talk-transcriber` und `talk-recording` mit
`replicas: 0` vor. Es laufen keine Pods dieser Deployments; Services und
NetworkPolicies bleiben vorhanden. Ohne Pods werden Talk-Transkriptionen nicht
verarbeitet.

`bge-embed`, `bge-embed-bulk` und `bge-rerank` laufen nicht auf mentolder, nur
auf devmesh. Das Fleet-Overlay entfernt sie samt `llm-gateway`-Services und
-IngressRoutes, zugehörigen NetworkPolicies und Modell-PVCs.

## Aktivierung über GitOps

In `prod-fleet/mentolder/kustomization.yaml` unter `replicas` den `count` der
benötigten Deployments von `0` auf `1` ändern und den regulären GitOps-Review-
und Lieferweg durchlaufen. Ein übergeordnetes Kustomize-Overlay kann dieselben
Deployment-Namen mit `count: 1` überschreiben. Diese Änderung aktiviert keine
Dienste automatisch anhand eingehender Anfragen; HPA/KEDA oder automatisches
Aufwecken sind nicht eingerichtet.

Für die Talk-Transkription `whisper` und `talk-transcriber` zusammen aktivieren.
Wenn Aufzeichnungen benötigt werden, zusätzlich `talk-recording` aktivieren.
Vor `count: 1` die vorhandene Nextcloud-/Bot-Konfiguration und die benötigten
Secret-Keys prüfen, ohne Secret-Werte auszugeben. Die bestehenden Website- und
Secret-Abhängigkeiten gelten weiterhin.
Beim ersten Start entstehen Kaltstarts für Image-Pulls und das Laden der
Modelle; der Dienst ist erst nach erfolgreicher Readiness verfügbar. Vorhandene
Images, Secrets und Scheduling-Vorgaben bleiben unverändert.

## Abschaltung und Grenzen

Die geänderten Counts über denselben GitOps-Weg wieder auf `0` setzen. Laufende
Talk-Aufzeichnungen und Transkriptionen vorher beenden, damit die Abschaltung
keine aktive Verarbeitung unterbricht. Manuelles `kubectl scale` ist nicht
dauerhaft: Flux stellt den in Git definierten Zustand wieder her.

Zugesichert ist das Umschalten **0 auf 1**. Beliebige horizontale Replikation
braucht zusätzliche Architekturarbeit: Talk-Prozesse besitzen lokalen Zustand. Counts größer als 1 sind deshalb kein unterstützter Betriebsvertrag.

Die Änderung betrifft ausschließlich Fleet-Mentolder. Devmesh bleibt unverändert;
der eingefrorene Korczewski-Workspace darf nicht aktiviert oder hochskaliert werden.

Mit eingerichtetem lokalem Test-Stack: `./tests/runner.sh local SA-23`.
Der Gesamt-Runner initialisiert vorher den lokalen Stack und Testdaten und ist
daher selbst kein Offline-Befehl. Ausschließlich offline ausführen:

```bash
RESULTS_FILE="$(mktemp)" bash tests/local/SA-23.sh
```

SA-23 selbst rendert nur lokale Manifeste und prüft Standardzustand, interne
Ressourcen, entfernte externe Routen sowie ein Aktivierungs-Overlay mit einer
Replika pro Deployment.
