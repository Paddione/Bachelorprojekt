# Runbook: devmesh-Tailnet (SP-1)

Bringt die devmesh-Server und die Dev-Clients ins Tailnet `p.korczewski` und prüft die
Erreichbarkeit. Enthält **keine** Credentials. Auth-Keys werden nie ins Repo geschrieben.

Soll-Zustand im Repo:

- `devmesh/inventory.yaml` — Peers mit Rolle, Tag, LAN-Adresse und Tailnet-Namen
- `devmesh/tailnet-policy.hujson` — ACL-Soll (Guard: `tests/spec/local-dev-mesh/tailnet-policy.bats`)
- `scripts/devmesh/tailnet-check.sh` — Prüfung, Aufruf `task devmesh:tailnet:check`

Entscheidungen: ADR-008 (Nachtrag 2026-09-11), `openspec/changes/devmesh-tailnet/design.md`.

## Rollen

| Rolle | Tag | Geräte | Zugriff |
|---|---|---|---|
| Server | `tag:devmesh` | gpu-metal (10.1.0.101), gpu-cluster (10.10.10.2), gpu-cluster2 (10.10.10.3) | untereinander vollständig |
| Client | `tag:devclient` | pk-desktop, pk-l-1, pk-tablet | auf Server tcp 22, 443, 6443 |

Kein allgemeiner Pfad von `tag:devmesh` nach `tag:devclient`. Einzige Ausnahme ist die GPU-Inferenz:
`tag:devmesh` → `gpu-host` (pk-desktop) auf `gpu_endpoint.port` aus dem Inventar (heute 1234).
`ws-ubuntu-1` tritt erst in SP-5 (T900120) bei.
k3s-Knotenverkehr läuft über das LAN, nicht über das Tailnet (SP-2).

## Vorbedingungen

1. SSH als `patrick` mit `~/.ssh/patrick_ed25519` auf alle drei Server:

   ```bash
   for h in 10.1.0.101 10.10.10.2 10.10.10.3; do
     ssh -i ~/.ssh/patrick_ed25519 -o BatchMode=yes -o ConnectTimeout=8 patrick@"$h" true \
       && echo "OK $h" || echo "FEHLT $h"
   done
   ```

   Jede Zeile muss `OK` zeigen. Fehlt eine, zuerst den SSH-Bootstrap erledigen.

2. Tailscale läuft auf PK-Desktop:

   ```bash
   "/mnt/c/Program Files/Tailscale/tailscale.exe" status --json | tr -d '\r' \
     | python3 -c 'import json,sys; print(json.load(sys.stdin)["BackendState"])'
   ```

   Erwartet: `Running`. Bei `NoState` oder `Stopped` den Tailscale-Dienst in Windows starten.

3. Admin-Rechte in der Tailscale-Admin-Konsole.

## Schritt 1: Tags in der Live-Policy anlegen

Admin-Konsole → Access controls. Den `tagOwners`-Block aus `devmesh/tailnet-policy.hujson`
übernehmen, die bestehenden `acls` **unverändert lassen**, speichern. Ohne `tagOwners` lassen sich
keine getaggten Auth-Keys erzeugen.

## Schritt 2: Server beitreten

Pro Server einen Auth-Key erzeugen (Settings → Keys → Generate auth key): Reusable aus,
Ephemeral aus, Pre-approved an, Tag `tag:devmesh`, Ablauf 1 Tag. Dann auf PK-Desktop (WSL):

```bash
host=10.1.0.101; name=gpu-metal     # danach 10.10.10.2/gpu-cluster, 10.10.10.3/gpu-cluster2
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" 'curl -fsSL https://tailscale.com/install.sh | sh'

umask 077; keyfile="$(mktemp -p /dev/shm ts-authkey.XXXXXX)"
read -rsp "Auth-Key fuer ${name}: " TS_KEY; echo
printf '%s' "$TS_KEY" > "$keyfile"; unset TS_KEY
scp -i ~/.ssh/patrick_ed25519 "$keyfile" patrick@"$host":.ts-authkey; rm -f "$keyfile"
ssh -t -i ~/.ssh/patrick_ed25519 patrick@"$host" \
  "chmod 600 ~/.ts-authkey; sudo tailscale up --auth-key=file:\$HOME/.ts-authkey --advertise-tags=tag:devmesh --hostname=${name}; rc=\$?; rm -f ~/.ts-authkey; exit \$rc"
```

`--hostname` setzt den Tailnet-Namen auf den Wert aus `devmesh/inventory.yaml`. Der Key liegt nur
in `/dev/shm` und kurz im Home des Servers, nie in einer Kommandozeile. Nach dem dritten Beitritt
unter Settings → Keys prüfen, dass kein Auth-Key mehr aktiv ist, und übrige widerrufen.

## Schritt 3: Clients taggen

- **PK-Desktop:** Admin-Konsole → Machines → `pk-desktop` → Edit ACL tags → `tag:devclient`.
- **PK-L-1, PK-Tablet:** Tailscale für Windows installieren und anmelden. In Machines den Namen auf
  `pk-l-1` bzw. `pk-tablet` setzen (Wert aus dem Inventar) und `tag:devclient` vergeben. In der
  WSL-Distro prüfen, dass das Tailnet sichtbar ist:

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

## Schritt 5: ACL einspielen

Die Repo-Policy erlaubt nur devmesh-Pfade und die `gpu-host`-Ausnahme. Sie ersetzt die Live-`acls`
erst nach einer Prüfung, weil heute andere Wege über das Tailnet laufen können. Bekannt sind
Zugriffe von Geräten außerhalb devmesh auf `pk-desktop`: LLM-Endpunkt `:1234` und
Brainstorm-Bridge `:47600`.

```bash
git grep -n "100\.102\.71\.114"      # Konsumenten der Tailnet-Adresse von pk-desktop
```

1. Live-Policy in der Admin-Konsole kopieren und mit `devmesh/tailnet-policy.hujson` vergleichen.
2. Enthält die Live-Policy Regeln außerhalb der devmesh-Pfade (z. B. den Default `*` → `*:*`) und
   nutzt ein Gerät außerhalb von devmesh (z. B. `pk-hetzner-8`) das Tailnet aktiv, **nicht
   ersetzen**. Stattdessen einen Folge-Change anlegen, der Spec und Policy um eine enge Regel
   ergänzt.
3. Sonst die Live-Policy durch den Inhalt der Repo-Datei ersetzen, speichern und Schritt 4
   wiederholen.

## Schritt 6: Heimrouter

FritzBox → Internet → Freigaben → Portfreigaben. Es darf keine Freigabe auf 10.1.0.101,
10.10.10.2 oder 10.10.10.3 zeigen. Tailscale baut nur ausgehende Verbindungen auf
(Requirement „Remote access to the SDLC surface only through the tailnet, without an inbound
port" in `openspec/specs/sdlc-isolation.md`).

## Datenschutz

Tailscale Inc. sieht Metadaten (Gerätenamen, öffentliche Schlüssel, Verbindungszeitpunkte), keine
Inhalte. Eintrag als Auftragsverarbeiter: `docs/legacy-html/verarbeitungsverzeichnis.html`.
Selbst gehostete Koordination (Headscale) bleibt Ausbaupfad.
