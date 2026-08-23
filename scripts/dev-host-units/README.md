# dev-host-units — Host-seitige systemd-Units für den ausgelagerten Dev-Cluster

Seit der Migration des k3d-Dev-Clusters auf **ws-1c8987 (10.0.33.1)** am 2026-08-23
laufen Teile der Dev-Anbindung als systemd-Units auf dem Host (WSL). Diese Dateien
sind die repotrackte Wahrheit; die live installierten Kopien liegen unter
`/etc/systemd/system/` bzw. `~/.config/systemd/user/`.

| Unit | Ebene | Zweck |
|------|-------|-------|
| `k3d-dev-ingress-bridge@.service` | System | socat `127.0.0.1:<port> → 10.0.33.1:<port>`; hält `*.localhost`-URLs gültig (RFC 6761 erzwingt 127.0.0.1, /etc/hosts greift nicht). Instanz: `@80`. |
| `../llm-proxy/llm-proxy-lan.service` | User | socat `:18236 → 127.0.0.1:18235` (range=WS-Subnetz), damit der Cluster den loopback-only llm-proxy erreicht (`svc/llm-proxy-host`, siehe `k3d/sdlc-stack/llm-proxy-host.yaml`). |

Schon vorher repotrackt (Mustergeber): `scripts/mcp-gateway/k3d-postgres-forward.service`
(15432 → shared-db, Context-getrieben) und `scripts/mcp-gateway/mcp-postgres-local.service`.

## Installieren / Entfernen

```bash
bash scripts/dev-host-units/install.sh      # BRIDGE_PORT=80 per Env überschreibbar
bash scripts/dev-host-units/uninstall.sh
```

## Rollback (Dev-Cluster zurück auf lokale Maschine)

```bash
k3d cluster start mentolder-dev             # lokaler Cluster (gestoppt, Volumes intakt)
kubectl config set-context k3d-mentolder-dev \
  --cluster=k3d-mentolder-dev --user=admin@k3d-mentolder-dev   # Context zurückbiegen
bash scripts/dev-host-units/uninstall.sh    # Brücken entfernen
```

Der alte Kontext `k3d-mentolder-dev-local` zeigt ebenfalls auf den lokalen Cluster.

## Bekannte Fallstricke

- **Context-Drift:** Der Context `k3d-mentolder-dev` wurde beim Docker-Restart am
  2026-08-23 still zurückgebogen (Split-Brain-Dual-Write in die Ticket-DB, siehe
  T015005/T015008). Vor DB-Schreibarbeit Server-URL prüfen:
  `kubectl config view --minify=false | grep 10.0.33.1`.
- **Port-Halter vor Unit-Start** (T002281-Klasse): belegt ein Fremd-Prozess den Port,
  landet die Unit in einer EADDRINUSE-Restart-Schleife statt sauber zu failen.
- Lokaler Alt-Cluster nur mit `docker stop` anhalten — Container laufen mit
  `restart=unless-stopped` und resurrecten sonst beim nächsten Daemon-Restart.
