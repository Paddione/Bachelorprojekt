# Runbook: devmesh-Tailnet (SP-1)

Bringt die devmesh-Server und die Dev-Clients ins Tailnet `p.korczewski` und prüft die
Erreichbarkeit. Enthält **keine** Credentials. Auth-Keys werden nie ins Repo geschrieben.

Soll-Zustand im Repo:

- `devmesh/inventory.yaml` — Peers mit Rolle, Tag, LAN-Adresse und Tailnet-Namen
- `devmesh/tailnet-policy.hujson` — Spiegel der Live-Policy (Guard: `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py`)
- `scripts/devmesh/tailnet-check.sh` — Prüfung, Aufruf `task devmesh:tailnet:check`

Entscheidungen: ADR-008 (Nachtrag 2026-09-11), Design `2026-09-11-devmesh-tailnet`.

## Rollen

| Rolle | Tag | Geräte | Zugriff |
|---|---|---|---|
| Server | `tag:gpu-server` | gpu-metal (10.1.0.101), gpu-cluster (10.10.10.2), gpu-cluster2 (10.10.10.3), gpu-cluster-3 (10.10.10.4) | alles (`grants`) |
| Client | — (Gerät unter dem Benutzerkonto) | pk-desktop, pk-l-1, pk-tablet | alles (`grants`) |

**Stand T016528 (2026-10-12):** Die Live-Policy erlaubt per `grants` allen Verkehr im
Tailnet (`* → *`). Die ursprünglich geplante restriktive ACL mit `tag:devmesh`/`tag:devclient`
(T900116) wurde nie eingespielt; das Repo spiegelt jetzt den Live-Stand. Eine engere Policy
ist ein eigener Change: vorher alle Pfade inventarisieren (u. a. `gpu-host`-Ports aus
`gpu_endpoint.ports`, Zugriffe von Hetzner-Geräten auf `pk-desktop`).
Weitere Tags: `tag:k8s-operator`/`tag:k8s` (Tailscale-Operator in devmesh), `tag:lan-dns`
(AdGuard, `docs/runbooks/devmesh-lan-dns.md`), `tag:orchestrator` (pk-desktop-linux).
Die Subnet-Route `10.0.0.0/24` geben gpu-cluster und gpu-cluster2 frei, genehmigt über
`autoApprovers` für `tag:gpu-server`.
k3s-Knotenverkehr läuft über das LAN, nicht über das Tailnet (SP-2).

## Schritt 1: Tag in der Live-Policy prüfen

`tag:gpu-server` muss in den `tagOwners` der Live-Policy stehen (siehe
`devmesh/tailnet-policy.hujson`). Ohne Eintrag lassen sich keine getaggten Auth-Keys erzeugen.

## Schritt 2: Server beitreten

Pro Server einen Auth-Key erzeugen (Settings → Keys → Generate auth key): Reusable aus,
Ephemeral aus, Pre-approved an, Tag `tag:gpu-server`, Ablauf 1 Tag. Dann auf PK-Desktop (WSL):

```bash
host=10.1.0.101; name=gpu-metal     # danach 10.10.10.2/gpu-cluster, 10.10.10.3/gpu-cluster2
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" 'curl -fsSL https://tailscale.com/install.sh | sh'

umask 077; keyfile="$(mktemp -p /dev/shm ts-authkey.XXXXXX)"
read -rsp "Auth-Key fuer ${name}: " TS_KEY; echo
printf '%s' "$TS_KEY" > "$keyfile"; unset TS_KEY
scp -i ~/.ssh/patrick_ed25519 "$keyfile" patrick@"$host":.ts-authkey; rm -f "$keyfile"
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" \
  "chmod 600 ~/.ts-authkey; sudo tailscale up --auth-key=file:\$HOME/.ts-authkey --advertise-tags=tag:gpu-server --hostname=${name}; rc=\$?; rm -f ~/.ts-authkey; exit \$rc"
```

`--hostname` setzt den Tailnet-Namen auf den Wert aus `devmesh/inventory.yaml`. Der Key liegt nur
in `/dev/shm` und kurz im Home des Servers, nie in einer Kommandozeile. Nach dem dritten Beitritt
unter Settings → Keys prüfen, dass kein Auth-Key mehr aktiv ist, und übrige widerrufen.

## Schritt 3: Clients anmelden

Clients bleiben Geräte unter dem Benutzerkonto, **ohne Tag** (`tailnet-check.sh` prüft das).

- **PK-L-1, PK-Tablet:** Tailscale für Windows installieren und anmelden. In Machines den Namen auf
  `pk-l-1` bzw. `pk-tablet` setzen (Wert aus dem Inventar). In der WSL-Distro prüfen, dass das
  Tailnet sichtbar ist:

  ```bash
  grep -i networkingMode /mnt/c/Users/*/.wslconfig    # networkingMode = mirrored
  ```

Tailscale nicht zusätzlich in der WSL-Distro installieren (Design D2).

## Schritt 4: Erreichbarkeit prüfen

```bash
task devmesh:tailnet:check
```

| Exit | Bedeutung | Handlung |
|---|---|---|
| 0 | jeder Server antwortet, je Zeile `direct` oder `relay` | zu Hause müssen alle drei `direct` sein |
| 1 | mindestens ein Server antwortet nicht, er wird genannt | Server an? `ping -c1 <lan_ip>` im LAN, auf dem Server `tailscale status` |
| 2 | Vorbedingung fehlt (CLI, Dienst nicht `Running`, Inventar ungültig) | Meldung lesen, kein Server-Befund |

Abnahme zu Hause auf PK-Desktop: alle drei Server `direct`, Exit 0. Abnahme unterwegs: PK-L-1 über
einen Mobilfunk-Hotspot, alle Server `direct` oder `relay`, Exit 0. Meldet ein Server zu Hause
`relay`, blockiert vermutlich eine Firewall UDP 41641: `tailscale.exe netcheck`.

## Schritt 5: Policy ändern

`devmesh/tailnet-policy.hujson` ist ein Spiegel der Live-Policy und wird nicht automatisch
eingespielt. Änderungen laufen in dieser Reihenfolge:

1. Live-Policy holen und mit der Repo-Datei vergleichen (Abweichungen zuerst klären):
   ```bash
   curl -s -u "$TS_API_KEY:" -H "Accept: application/hujson" -D /tmp/acl.h \
     https://api.tailscale.com/api/v2/tailnet/-/acl > /tmp/acl-live.hujson
   ```
2. Änderung vornehmen, validieren (`POST …/acl/validate`) und mit dem ETag aus `/tmp/acl.h`
   einspielen (`POST …/acl`, Header `If-Match`). Alternativ in der Admin-Konsole.
3. Repo-Datei auf den neuen Live-Stand ziehen, Guard-Tests laufen lassen, PR.

Den API-Key nur als Umgebungsvariable nutzen und danach widerrufen.

## Schritt 6: Heimrouter

FritzBox → Internet → Freigaben → Portfreigaben. Es darf keine Freigabe auf 10.1.0.101,
10.10.10.2 oder 10.10.10.3 zeigen. Tailscale baut nur ausgehende Verbindungen auf
(Requirement „Remote access to the SDLC surface only through the tailnet, without an inbound
port" in der sdlc-isolation-Spec).

## Datenschutz

Tailscale Inc. sieht Metadaten (Gerätenamen, öffentliche Schlüssel, Verbindungszeitpunkte), keine
Inhalte. Eintrag als Auftragsverarbeiter: `docs/legacy-html/verarbeitungsverzeichnis.html`.
Selbst gehostete Koordination (Headscale) bleibt Ausbaupfad.

## Schritt 7: Umzug llm-proxy/bge-mcp/mcp-postgres nach devmesh (T900191)

Voraussetzung: Schritte 1–6 sind einmal durchlaufen (Tailnet steht, ACL eingespielt) und P1a/P1b/P2
dieses Change (`dev-local/components/llm-services`, Migration) sind bereits gemergt.

1. **Secrets siegeln.** `BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`, `LLM_PROXY_ADMIN_TOKEN` und
   `MCP_READONLY_DB_PASSWORD` (neuer Key, P1b: Passwort des `mcp_readonly`-DB-Users in devmesh,
   analog zum fleet-Pendant) in `environments/.secrets/dev.yaml` eintragen (Schema-Einträge aus
   P1b), dann:
   ```bash
   task env:seal ENV=dev
   ```
   Committed wird `environments/sealed-secrets/dev.yaml`.
2. **Stack deployen.**
   ```bash
   task devmesh:deploy
   ```
   Erwartet: Rollout-Status für `deployment/llm-services` (und alle anderen Profil-Deployments)
   meldet `successfully rolled out`.
3. **Registry-Migration ausführen** (legt `tickets.llm_proxy_backends` mit devmesh-URLs an —
   **nicht** zu verwechseln mit `task devmesh:migrate`, das kopiert pocket_id/website-Inhalte
   aus dem alten k3d-Cluster und hat mit der Backend-Registry nichts zu tun):
   ```bash
   task devmesh:registry:migrate
   ```
4. **WSL-Units stoppen und deaktivieren** — erst NACHDEM Schritt 2/3 grün sind, sonst verliert
   man beide Quellen gleichzeitig:
   ```bash
   systemctl --user disable --now llm-proxy.service llm-proxy-lan.service bge-mcp.service \
     bge-forward-embed.service bge-forward-rerank.service mcp-postgres-local.service \
     k3d-postgres-forward.service
   ```
5. **Gateway-Units umstellen** — `mcp-gateway.service` bleibt bestehen und bedient ab jetzt nur
   noch fleet (`:18080`, `:13002`); ein neues, zweites Unit
   `scripts/mcp-gateway/devmesh-forward.service` bedient die drei devmesh-Ports
   (`:18235`, `:13001`, `:13005` aus `svc/llm-services`, Context `devmesh`). Wortlaut/Unit-Datei
   sind P3b-Zuständigkeit; der gemeinsame Taskfile-Einstieg bleibt unverändert
   `agents:mcp-gateway:start`/`agents:mcp-gateway:install` (startet/installiert jetzt beide
   Units):
   ```bash
   task agents:mcp-gateway:install
   task agents:mcp-gateway:start
   ```
6. **Windows-Autostart neu registrieren** (PK-Desktop, PowerShell): das gefixte
   `start-windows.ps1` (T900190) startet die devmesh-Port-Forwards statt des lokalen
   bge-mcp-Shims:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-gateway/register-autostart.ps1
   ```
7. **Abnahme:** die drei Health-Checks aus `.claude/skills/references/mcp-tool-guide.md`
   (`mcp-postgres`, `bge-mcp`, llm-proxy) gegen `127.0.0.1:13001`, `:13005`, `:18235` — alle
   `200`/erreichbar, **ohne** dass eine WSL-Unit läuft:
   ```bash
   systemctl --user list-units 'llm-proxy*' 'bge-mcp*' 'bge-forward-*' 'mcp-postgres-local*' \
     'k3d-postgres-forward*' --no-legend | wc -l   # erwartet: 0
   systemctl --user is-active devmesh-forward.service   # erwartet: active
   ```
