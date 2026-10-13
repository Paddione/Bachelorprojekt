# Runbook: Cloud-Umgebung "mentolder-prod" an den fleet-Cluster anbinden

Gibt einer Claude-Code-on-the-web-Umgebung cluster-admin-Zugriff auf fleet (Prod, Brand mentolder).
Enthält **keine** Credentials. Skripte: `scripts/cloud-env/{rbac-fleet.yaml,fleet-kubeconfig.sh,setup-fleet.sh}`.
Gegenstück für devmesh: `cloud-env-devmesh.md`.

## Wie es funktioniert

Die drei fleet-Control-Plane-Nodes (`204.168.244.104`, `37.27.251.38`, `62.238.23.79`) nehmen `:6443`
aus dem Internet an. Es gibt keinen Tailnet-Pfad. Zugang: ServiceAccount `cloud-env-fleet-admin`
(Namespace `kube-system`, Binding auf `cluster-admin`), kurzlebiges Token (Standard 24h) in einer Kubeconfig.
Es gibt kein dauerhaftes Token. Ein Token wird bei Bedarf ausgestellt, siehe Abschnitt Notfall.

**Das Token ist ein Generalschlüssel für Prod.** Nur als Secret der Cloud-Umgebung oder im Tresor halten,
nie in Repo, Tickets oder Chat. FluxCD bleibt der Standard-Deployweg; `kubectl apply` ist Break-Glass.

## Notfall: Token beschaffen

Das Token liegt nirgends vorrätig, es wird ausgestellt. Drei Wege, in dieser Reihenfolge:

1. **Workstation (WSL) mit Kontext `fleet`:**
   ```bash
   bash scripts/cloud-env/fleet-kubeconfig.sh          # TOKEN_DURATION=72h für längere Einsätze
   base64 -w0 ~/.kube/fleet-cloud.yaml                 # -> FLEET_KUBECONFIG_B64 der Umgebung
   ```
2. **Kontext `fleet` fehlt oder defekt:** per SSH auf einen Control-Plane-Node (Zugang und Key:
   `ssh-zugang-fleet.md`, git-crypt-Repo-Config `environments/.secrets/.ssh/config`, User `patrick` mit `sudo`).
   Dort das Skript mit dem k3s-eigenen kubectl laufen lassen, die Kubeconfig-Datei auf die Workstation kopieren:
   ```bash
   KUBECTL="sudo k3s kubectl" bash fleet-kubeconfig.sh
   ```
   Das Skript liegt im Repo, bei Bedarf per `scp` auf den Node.
3. **Repo gesperrt (git-crypt):** erst entsperren, sonst ist der SSH-Key Binärdaten.
   Siehe `credentials-finden.md` (Prüfung am Anfang, Entsperren in Schritt 5).

Danach in der Cloud-Umgebung `FLEET_KUBECONFIG_B64` ersetzen und `setup-fleet.sh connect` ausführen.
Meldet `connect` „Token abgelaufen“, wiederholt man Weg 1 oder 2. Der API-Server kann `--duration`
nach oben begrenzen. Dann liefert `create token` die erlaubte Dauer, nicht die angefragte.

## Einrichtung

1. **RBAC anwenden** (WSL, einmalig, Prod-Schreibzugriff):
   ```bash
   kubectl --context fleet apply -f scripts/cloud-env/rbac-fleet.yaml
   ```
2. **Kubeconfig mit frischem Token erzeugen** (eigene Datei, die normale bleibt unberührt):
   ```bash
   bash scripts/cloud-env/fleet-kubeconfig.sh
   base64 -w0 ~/.kube/fleet-cloud.yaml
   ```
   Das Skript prüft die Datei gleich gegen den API-Server (auch, dass die IP im API-Zertifikat steht).
   Schlägt das mit einem x509-Fehler fehl, `FLEET_API` auf einen Namen setzen, der im Zertifikat steht.
3. **Umgebung eintragen** (claude.ai/code → Umgebung `mentolder-prod` bearbeiten):
   - Variable: `FLEET_KUBECONFIG_B64` = Ausgabe aus Schritt 2
   - Setup-Skript: `bash scripts/cloud-env/setup-fleet.sh install`
   - Netzwerkzugriff: „Full" oder Hostliste mit den drei IPs (Port 6443), `dl.k8s.io`, `github.com`
4. **`connect` je Session** (nur bei `CLAUDE_CODE_REMOTE=true`), SessionStart-Hook in `.claude/settings.json`:
   ```json
   { "type": "command",
     "command": "[ \"$CLAUDE_CODE_REMOTE\" = \"true\" ] && bash scripts/cloud-env/setup-fleet.sh connect || true",
     "timeout": 60 }
   ```

## Prüfen

```bash
bash scripts/cloud-env/setup-fleet.sh connect
kubectl get nodes
```

## Widerruf und Rotation

```bash
kubectl --context fleet -n kube-system delete serviceaccount cloud-env-fleet-admin   # alle Tokens ungültig
kubectl --context fleet apply -f scripts/cloud-env/rbac-fleet.yaml                    # ServiceAccount neu
```
Danach Notfall-Weg 1 oder 2 für ein neues Token. Bei Verdacht auf Abfluss sofort widerrufen.
Ohne Widerruf läuft ein Token nach spätestens `TOKEN_DURATION` ab.

## Bekannte Grenzen

- Die Skripte wurden bisher nur auf Syntax geprüft, nicht gegen eine echte Cloud-Umgebung.
- `mcp-kubernetes` (:18080) ist ein Port-Forward auf den dev-pod und aus der Cloud nicht erreichbar;
  in der Cloud-Umgebung läuft `kubectl` direkt.
- Die API-Server sind öffentlich erreichbar. Eine IP-Einschränkung (Hetzner-Firewall) ist mit wechselnden
  Egress-IPs der Cloud-Umgebung nicht sinnvoll; das Token ist die einzige Hürde.
