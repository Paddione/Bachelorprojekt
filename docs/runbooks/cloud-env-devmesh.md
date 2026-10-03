# Runbook: Cloud-Umgebung an devmesh und MCPs anbinden

Verbindet eine Claude-Code-on-the-web-Umgebung mit dem devmesh-Cluster und den MCPs
`mcp-postgres` (:13001) und `bge-mcp` (:13005). Enthält **keine** Credentials.
Skript: `scripts/cloud-env/setup.sh`. Grundregeln für Secrets: `credentials-finden.md`.

Nur devmesh. fleet (Prod) liegt nicht im Tailnet und ist bewusst nicht angebunden;
damit fehlen `mcp-kubernetes` (:18080), `github` (:13002) und `warden`.

## Wie es funktioniert

devmesh-Knoten sind Tailnet-Peers (`tag:devmesh`, `devmesh/inventory.yaml`). Die Cloud-Umgebung
tritt als `tag:devclient` bei; die ACL (`devmesh/tailnet-policy.hujson`) erlaubt von dort 22, 443
und 6443. `tailscaled` läuft im Userspace-Modus, `kubectl` geht über dessen SOCKS5-Proxy
(`socks5h://127.0.0.1:1055`) an `https://<tailnet_name>:6443`. Dazu ein
`kubectl port-forward` auf `svc/llm-services` (Namespace `workspace`), wie
`scripts/mcp-gateway/devmesh-forward.service`. Im Cluster wird nichts installiert.

## Einrichtung

1. **Kubeconfig erzeugen** (WSL, einmalig; eigene Datei, die normale Kubeconfig bleibt unberührt):
   ```bash
   KUBECONFIG_TARGET=$HOME/.kube/devmesh.yaml bash scripts/devmesh/kubeconfig.sh
   base64 -w0 ~/.kube/devmesh.yaml
   ```
   Das ist eine Admin-Kubeconfig. Besser ist ein ServiceAccount mit minimalen Rechten.
2. **Tailscale-Auth-Key**: Admin-Konsole → Settings → Keys → Generate auth key, *Reusable*,
   *Ephemeral*, Tag `tag:devclient`. Ohne Tag greift die ACL nicht, `kubectl` läuft in den Timeout.
3. **MCP-Tokens** liegen lokal in `~/.config/mcp-postgres/server.env` (`MCP_POSTGRES_TOKEN`)
   und `~/.config/bge-mcp/server.env` (`BGE_MCP_TOKEN`). Nicht ausgeben, direkt kopieren.
4. **Umgebung eintragen** (claude.ai/code → Umgebung bearbeiten):
   - Variablen: `TS_AUTHKEY`, `DEVMESH_KUBECONFIG_B64`, `MCP_POSTGRES_TOKEN`, `BGE_MCP_TOKEN`
     (oder nur der Vaultwarden-Bootstrap, siehe unten)
   - Setup-Skript: `bash scripts/cloud-env/setup.sh install`
   - Netzwerkzugriff: Tailscale (`controlplane.tailscale.com`, DERP), `dl.k8s.io` und
     `tailscale.com` müssen erreichbar sein (Einstellung „Full" oder eigene Hostliste).
5. **`connect` je Session starten.** Das Setup-Skript läuft nur beim Bau der Umgebung, Tailscale und
   Port-Forward müssen aber in jeder Session neu hoch. Dafür gehört ein SessionStart-Hook nach
   `.claude/settings.json` (nur bei `CLAUDE_CODE_REMOTE=true`):
   ```json
   {
     "hooks": [
       {
         "type": "command",
         "command": "[ \"$CLAUDE_CODE_REMOTE\" = \"true\" ] && bash scripts/cloud-env/setup.sh connect || true",
         "timeout": 120
       }
     ]
   }
   ```
   Alternativ `bash scripts/cloud-env/setup.sh connect` einmal von Hand in der Session ausführen.

## Fallback: Secrets aus Vaultwarden

Fehlt eine der vier Variablen `TS_AUTHKEY`, `DEVMESH_KUBECONFIG_B64`, `MCP_POSTGRES_TOKEN`,
`BGE_MCP_TOKEN`, holt `setup.sh connect` sie aus dem Tresor, **sofern** der Bootstrap gesetzt ist:

| Variable | Zweck |
|---|---|
| `BW_HOST` | URL der Vaultwarden-Instanz |
| `BW_CLIENTID`, `BW_CLIENTSECRET` | API-Key des Tresor-Nutzers |
| `BW_PASSWORD` | Master-Passwort zum Entsperren |

Dieselben vier Schlüssel nutzt `warden-mcp` (`~/.config/warden-mcp/server.env`). Sie sind der
einzige Satz, der dann noch als Umgebungsvariable stehen muss.

**Item-Konvention:** je Variable ein Login-Item mit dem Namen
`devmesh-cloud-env/<VARIABLE>` (Präfix änderbar über `VAULT_ITEM_PREFIX`), der Wert steht im
**Passwortfeld**. Für `DEVMESH_KUBECONFIG_B64` ist das die Base64-Zeile aus Schritt 1.
Die Items müssen einmalig angelegt werden; sie existieren nicht von selbst.

Ablauf im Skript: `bw` (installiert `install` mit `@bitwarden/cli@~2026.6.0`, neuere Versionen
entschlüsseln Vaultwarden 1.36.0 nicht) → `bw login --apikey` → `bw unlock` → `bw get password`.
Werte werden nie ausgegeben, nur der Variablenname. Geholte Werte landen zusätzlich in
`$CLAUDE_ENV_FILE`, damit spätere Tool-Aufrufe der Session sie sehen. Nach dem Holen wird der
Tresor wieder gesperrt.

Schlägt der Fallback fehl (Bootstrap unvollständig, Item fehlt, falsche Version), bricht das Skript
mit dem Namen der fehlenden Variable ab. Einen Wert zu erfinden oder neu zu erzeugen wäre eine
Rotation und gehört dem Operator.

## Prüfen

```bash
kubectl --context devmesh -n workspace get svc/llm-services
claude mcp list
```

`setup.sh connect` prüft am Ende selbst API, Service und `mcp-postgres` (HTTP 401/403 bedeutet
falscher Token).

## Bekannte Grenzen

- Ein Skript-Lauf **nach** dem Start einer Session registriert die MCPs, aber Claude Code lädt sie
  möglicherweise erst beim nächsten Start. Dann in der Session `/mcp` zum Neuverbinden nutzen.
- Stammen die Tokens nur aus dem Tresor, stehen sie beim Laden der MCP-Konfiguration eventuell noch
  nicht in der Umgebung. Auch dann hilft `/mcp` nach dem ersten `connect`.
- Das Skript wurde bisher nur auf Syntax und den Abbruch bei fehlenden Variablen geprüft, nicht
  gegen eine echte Cloud-Umgebung. Ein erster Lauf ist der eigentliche Test.
- Port-Forward und Tailscale sind Prozesse der Session; sie enden mit ihr (ephemerer Key räumt
  den Tailnet-Eintrag auf).
