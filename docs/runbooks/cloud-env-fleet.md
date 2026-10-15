# Runbook: Cloud-Umgebung "mentolder-prod" an den fleet-Cluster anbinden

Gibt einer Claude-Code-on-the-web-Umgebung cluster-admin-Zugriff auf fleet (Prod, Brand mentolder).
Enthält **keine** Credentials. Skripte: `scripts/cloud-env/{rbac-fleet.yaml,fleet-kubeconfig.sh,setup-fleet.sh}`.
Gegenstück für devmesh: `cloud-env-devmesh.md`.

## Wie es funktioniert

Netzpfad ist das Tailnet: Die Cloud-Umgebung tritt per Tailscale (Userspace, SOCKS5) bei und erreicht den
API-Server unter seinem Tailnet-Namen (`https://gekko-hetzner-2.tail8a4425.ts.net:6443`). Dafür braucht die
Umgebung zusätzlich `TS_AUTHKEY` (reusable, ephemeral, siehe `cloud-env-devmesh.md`, Schritt 2).
Die öffentlichen IPs auf `:6443` sind aus manchen Netzen nicht erreichbar und kein vorgesehener Pfad.
Zugang: ServiceAccount `cloud-env-fleet-admin`
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
   FLEET_API=https://gekko-hetzner-2.tail8a4425.ts.net:6443 bash scripts/cloud-env/fleet-kubeconfig.sh
   base64 -w0 ~/.kube/fleet-cloud.yaml
   ```
   Das Skript prüft die Datei gleich gegen den API-Server (auch den Namen im API-Zertifikat).
3. **Umgebung eintragen** (claude.ai/code → Umgebung `mentolder-prod` bearbeiten):
   - Variablen: `FLEET_KUBECONFIG_B64` = Ausgabe aus Schritt 2, `TS_AUTHKEY`
   - Setup-Skript: `bash scripts/cloud-env/setup-fleet.sh install`
   - Netzwerkzugriff: „Full" oder Hostliste mit `controlplane.tailscale.com`, DERP, `tailscale.com`, `dl.k8s.io`
4. **`connect` je Session** (nur bei `CLAUDE_CODE_REMOTE=true`), SessionStart-Hook in `.claude/settings.json`
   (bereits eingetragen, läuft nur wenn `FLEET_KUBECONFIG_B64` gesetzt ist):
   ```json
   { "type": "command",
     "command": "[ \"$CLAUDE_CODE_REMOTE\" = \"true\" ] && [ -n \"$FLEET_KUBECONFIG_B64\" ] && bash scripts/cloud-env/setup-fleet.sh connect || true",
     "timeout": 120 }
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
